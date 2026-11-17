import crypto from 'crypto';
import { AUTH_CONFIG, env } from '../../config/env.ts';
import { RefreshTokenModel } from './auth.model.ts';
import { UserModel } from '../users/users.model.ts';
import { getCRCourseIdsForUserId, toPublicUser } from '../users/users.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { logger } from '../../utils/logger.ts';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
} from '../../utils/crypto.ts';
import { UserRole, UserStatus, type PublicUser } from '../../../shared/types.ts';
import type { LoginInput, RegisterInput } from './auth.validation.ts';

function ensureAuthSecretsConfigured(): void {
  if (!env.jwtAccessSecret || !env.jwtRefreshSecret) {
    throw new AppError(
      503,
      'CONFIG_MISSING',
      'JWT secrets are not configured on the server. Add JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in the Secrets panel.'
    );
  }
}

async function issueSessionTokens(
  userId: string,
  role: UserRole,
  email: string,
  familyId: string,
  reqMeta?: RequestMeta
): Promise<{ accessToken: string; refreshToken: string }> {
  ensureAuthSecretsConfigured();

  const accessToken = signAccessToken({ sub: userId, role, email });
  const refreshToken = generateOpaqueToken(48);
  const tokenHash = hashToken(refreshToken);

  const expiresAt = new Date(
    Date.now() + AUTH_CONFIG.refreshTokenTtlDays * 24 * 60 * 60 * 1000
  );

  await RefreshTokenModel.create({
    userId,
    tokenHash,
    familyId,
    expiresAt,
    userAgent: reqMeta?.userAgent ?? null,
    ip: reqMeta?.ip ?? null,
  });

  return { accessToken, refreshToken };
}

export async function registerUser(
  input: RegisterInput,
  reqMeta?: RequestMeta
): Promise<{
  user: PublicUser;
  requiresApproval: boolean;
  accessToken?: string;
  refreshToken?: string;
}> {
  if (input.role && input.role !== UserRole.STUDENT && input.role !== UserRole.FACULTY) {
    throw new AppError(
      403,
      'ROLE_SELF_ASSIGN_FORBIDDEN',
      'Elevated roles cannot be self-assigned'
    );
  }

  const targetRole =
    input.role === UserRole.FACULTY || input.accountType === UserRole.FACULTY
      ? UserRole.FACULTY
      : UserRole.STUDENT;

  const email = input.email.toLowerCase().trim();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_EXISTS',
      'An account with this email already exists'
    );
  }

  const cleanStudentId =
    targetRole === UserRole.STUDENT && input.studentId?.trim()
      ? sanitizePlainText(input.studentId)
      : undefined;

  if (cleanStudentId) {
    const existingSid = await UserModel.findOne({ studentId: cleanStudentId });
    if (existingSid) {
      throw new AppError(
        409,
        'STUDENT_ID_EXISTS',
        'A student with this ID is already registered'
      );
    }
  }

  const passwordHash = await hashPassword(input.password);
  const status =
    targetRole === UserRole.FACULTY ? UserStatus.PENDING : UserStatus.ACTIVE;

  const user = await UserModel.create({
    name: sanitizePlainText(input.name),
    email,
    passwordHash,
    role: targetRole,
    status,
    studentId: cleanStudentId,
    department: sanitizePlainText(input.department),
    batch: input.batch ? sanitizePlainText(input.batch) : null,
    profile: { bio: '', skills: [], interests: [] },
    availability: [],
    optedOutOfMatching: false,
  });

  await recordAuditLog({
    actor: { id: user._id.toString(), email: user.email, role: user.role },
    action: 'AUTH_REGISTER',
    targetType: 'USER',
    targetId: user._id.toString(),
    metadata: { role: user.role, status: user.status },
    reqMeta,
  });

  const publicUser = toPublicUser(user, []);

  if (status === UserStatus.PENDING) {
    return {
      user: publicUser,
      requiresApproval: true,
    };
  }

  const tokens = await issueSessionTokens(
    user._id.toString(),
    user.role,
    user.email,
    crypto.randomUUID(),
    reqMeta
  );

  return {
    user: publicUser,
    requiresApproval: false,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function loginUser(
  input: LoginInput,
  reqMeta?: RequestMeta
): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  ensureAuthSecretsConfigured();
  const email = input.email.toLowerCase().trim();

  const user = await UserModel.findOne({ email, deletedAt: null }).select(
    '+passwordHash'
  );

  if (!user) {
    await recordAuditLog({
      actor: { id: null, email, role: 'ANONYMOUS' },
      action: 'AUTH_LOGIN_FAILED',
      targetType: 'USER',
      metadata: { reason: 'USER_NOT_FOUND' },
      reqMeta,
    });
    throw new AppError(
      401,
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  const isMatch = await verifyPassword(input.password, user.passwordHash);
  if (!isMatch) {
    await recordAuditLog({
      actor: { id: user._id.toString(), email: user.email, role: user.role },
      action: 'AUTH_LOGIN_FAILED',
      targetType: 'USER',
      targetId: user._id.toString(),
      metadata: { reason: 'INVALID_PASSWORD' },
      reqMeta,
    });
    throw new AppError(
      401,
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  if (user.status === UserStatus.PENDING) {
    throw new AppError(
      403,
      'ACCOUNT_PENDING',
      'Your faculty account is pending administrator approval.'
    );
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new AppError(
      403,
      'ACCOUNT_SUSPENDED',
      'Your account has been suspended. Please contact an administrator.'
    );
  }

  const familyId = crypto.randomUUID();
  const { accessToken, refreshToken } = await issueSessionTokens(
    user._id.toString(),
    user.role,
    user.email,
    familyId,
    reqMeta
  );

  const crCourseIds = await getCRCourseIdsForUserId(user._id.toString());

  await recordAuditLog({
    actor: { id: user._id.toString(), email: user.email, role: user.role },
    action: 'AUTH_LOGIN_SUCCESS',
    targetType: 'USER',
    targetId: user._id.toString(),
    metadata: { crCourseCount: crCourseIds.length },
    reqMeta,
  });

  return {
    user: toPublicUser(user, crCourseIds),
    accessToken,
    refreshToken,
  };
}

export async function refreshSession(
  rawRefreshToken: string | undefined,
  reqMeta?: RequestMeta
): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  ensureAuthSecretsConfigured();
  if (!rawRefreshToken) {
    throw new AppError(401, 'TOKEN_MISSING', 'Refresh token is missing');
  }

  const incomingHash = hashToken(rawRefreshToken);
  const existingToken = await RefreshTokenModel.findOne({ tokenHash: incomingHash });

  if (!existingToken) {
    throw new AppError(401, 'TOKEN_INVALID', 'Invalid refresh token');
  }

  // Reuse detection: if token was already revoked, revoke entire token family!
  if (existingToken.revokedAt) {
    await RefreshTokenModel.updateMany(
      { familyId: existingToken.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    await recordAuditLog({
      actor: {
        id: existingToken.userId.toString(),
        email: 'unknown',
        role: 'SYSTEM',
      },
      action: 'REFRESH_TOKEN_REUSE_DETECTED',
      targetType: 'REFRESH_TOKEN',
      targetId: existingToken._id.toString(),
      metadata: { familyId: existingToken.familyId },
      reqMeta,
    });
    throw new AppError(
      401,
      'TOKEN_REUSE_DETECTED',
      'Session security alert: please sign in again'
    );
  }

  if (existingToken.expiresAt.getTime() < Date.now()) {
    existingToken.revokedAt = new Date();
    await existingToken.save();
    throw new AppError(401, 'TOKEN_EXPIRED', 'Refresh token has expired');
  }

  const user = await UserModel.findOne({
    _id: existingToken.userId,
    deletedAt: null,
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    existingToken.revokedAt = new Date();
    await existingToken.save();
    throw new AppError(401, 'ACCOUNT_UNAVAILABLE', 'Account is not active');
  }

  const newRefreshToken = generateOpaqueToken(48);
  const newTokenHash = hashToken(newRefreshToken);
  const expiresAt = new Date(
    Date.now() + AUTH_CONFIG.refreshTokenTtlDays * 24 * 60 * 60 * 1000
  );

  existingToken.revokedAt = new Date();
  existingToken.replacedByTokenHash = newTokenHash;
  await existingToken.save();

  await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: newTokenHash,
    familyId: existingToken.familyId,
    expiresAt,
    userAgent: reqMeta?.userAgent ?? null,
    ip: reqMeta?.ip ?? null,
  });

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  const crCourseIds = await getCRCourseIdsForUserId(user._id.toString());

  return {
    user: toPublicUser(user, crCourseIds),
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logoutSession(
  rawRefreshToken: string | undefined,
  reqMeta?: RequestMeta
): Promise<void> {
  if (!rawRefreshToken) return;
  const incomingHash = hashToken(rawRefreshToken);
  const token = await RefreshTokenModel.findOne({ tokenHash: incomingHash });
  if (token && !token.revokedAt) {
    token.revokedAt = new Date();
    await token.save();

    const user = await UserModel.findById(token.userId).select('email role');
    if (user) {
      await recordAuditLog({
        actor: { id: user._id.toString(), email: user.email, role: user.role },
        action: 'AUTH_LOGOUT',
        targetType: 'USER',
        targetId: user._id.toString(),
        reqMeta,
      });
    }
  }
}

export async function forgotPassword(
  rawEmail: string,
  reqMeta?: RequestMeta
): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  const user = await UserModel.findOne({ email, deletedAt: null });

  if (!user || user.status === UserStatus.SUSPENDED) {
    return;
  }

  const resetToken = generateOpaqueToken(32);
  user.passwordResetTokenHash = hashToken(resetToken);
  user.passwordResetExpiresAt = new Date(
    Date.now() + AUTH_CONFIG.passwordResetTtlMinutes * 60 * 1000
  );
  await user.save();

  const resetUrl = `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

  if (env.isDev) {
    logger.info(
      { email: user.email, resetUrl },
      'Development password reset link generated'
    );
  }

  await recordAuditLog({
    actor: { id: user._id.toString(), email: user.email, role: user.role },
    action: 'AUTH_PASSWORD_RESET_REQUESTED',
    targetType: 'USER',
    targetId: user._id.toString(),
    reqMeta,
  });
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
  reqMeta?: RequestMeta
): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const user = await UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
    deletedAt: null,
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw new AppError(
      400,
      'INVALID_OR_EXPIRED_RESET_TOKEN',
      'Password reset link is invalid or has expired'
    );
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  await RefreshTokenModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await recordAuditLog({
    actor: { id: user._id.toString(), email: user.email, role: user.role },
    action: 'AUTH_PASSWORD_RESET_COMPLETED',
    targetType: 'USER',
    targetId: user._id.toString(),
    reqMeta,
  });
}
