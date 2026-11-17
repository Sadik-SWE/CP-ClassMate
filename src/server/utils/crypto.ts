import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AUTH_CONFIG, env } from '../config/env.ts';
import type { UserRole } from '../../shared/types.ts';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  type: 'access';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, AUTH_CONFIG.bcryptCost);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateOpaqueToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  if (!env.jwtAccessSecret) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }
  return jwt.sign(
    { ...payload, type: 'access' },
    env.jwtAccessSecret,
    { expiresIn: AUTH_CONFIG.accessTokenTtl }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  if (!env.jwtAccessSecret) {
    throw new Error('JWT_ACCESS_SECRET is not configured');
  }
  const decoded = jwt.verify(token, env.jwtAccessSecret);
  if (typeof decoded !== 'object' || decoded === null || decoded.type !== 'access') {
    throw new Error('Invalid access token payload');
  }
  return decoded as AccessTokenPayload;
}
