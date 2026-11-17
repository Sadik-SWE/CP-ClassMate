import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { AUTH_CONFIG, env } from '../../config/env.ts';
import { connectDatabase, isDatabaseReady } from '../../config/db.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as authService from './auth.service.ts';
import * as usersService from '../users/users.service.ts';
import type { LoginInput, RegisterInput } from './auth.validation.ts';

async function ensureDbReady(): Promise<void> {
  if (!isDatabaseReady()) {
    await connectDatabase();
    if (!isDatabaseReady()) {
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Database is not connected. Add MONGODB_URI in the Secrets panel.'
      );
    }
  }
}

function extractReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

function getRefreshCookieOptions(req: Request): CookieOptions {
  const isHttps =
    req.secure ||
    req.header('x-forwarded-proto') === 'https' ||
    !env.isDev;

  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: AUTH_CONFIG.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const input = req.validated?.body as RegisterInput;
    const result = await authService.registerUser(input, extractReqMeta(req));

    if (result.refreshToken) {
      res.cookie(
        AUTH_CONFIG.refreshCookieName,
        result.refreshToken,
        getRefreshCookieOptions(req)
      );
    }

    sendSuccess(
      res,
      201,
      result.requiresApproval
        ? 'Faculty account created and pending administrator approval.'
        : 'Account registered successfully.',
      {
        user: result.user,
        requiresApproval: result.requiresApproval,
        accessToken: result.accessToken ?? null,
      }
    );
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const input = req.validated?.body as LoginInput;
    const result = await authService.loginUser(input, extractReqMeta(req));

    res.cookie(
      AUTH_CONFIG.refreshCookieName,
      result.refreshToken,
      getRefreshCookieOptions(req)
    );

    sendSuccess(res, 200, 'Signed in successfully.', {
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const rawToken = req.cookies?.[AUTH_CONFIG.refreshCookieName] as
      | string
      | undefined;
    const result = await authService.refreshSession(rawToken, extractReqMeta(req));

    res.cookie(
      AUTH_CONFIG.refreshCookieName,
      result.refreshToken,
      getRefreshCookieOptions(req)
    );

    sendSuccess(res, 200, 'Session refreshed.', {
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (err) {
    res.clearCookie(AUTH_CONFIG.refreshCookieName, {
      ...getRefreshCookieOptions(req),
      maxAge: undefined,
    });
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = req.cookies?.[AUTH_CONFIG.refreshCookieName] as
      | string
      | undefined;
    if (!isDatabaseReady()) {
      await connectDatabase();
    }
    if (isDatabaseReady()) {
      await authService.logoutSession(rawToken, extractReqMeta(req));
    }
    res.clearCookie(AUTH_CONFIG.refreshCookieName, {
      ...getRefreshCookieOptions(req),
      maxAge: undefined,
    });
    sendSuccess(res, 200, 'Signed out successfully.', { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const userId = req.authUser?.id;
    if (!userId) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const user = await usersService.getUserProfileById(userId);
    sendSuccess(res, 200, 'Current user profile retrieved.', { user });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const { email } = (req.validated?.body ?? {}) as { email: string };
    await authService.forgotPassword(email, extractReqMeta(req));
    sendSuccess(
      res,
      200,
      'If an active account exists for that email, a reset link has been logged in development.',
      { requested: true }
    );
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDbReady();
    const { token, password } = (req.validated?.body ?? {}) as {
      token: string;
      password: string;
    };
    await authService.resetPassword(token, password, extractReqMeta(req));
    sendSuccess(res, 200, 'Password has been reset successfully.', {
      reset: true,
    });
  } catch (err) {
    next(err);
  }
}
