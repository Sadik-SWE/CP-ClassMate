import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { sendError } from '../utils/apiResponse.ts';

function rateLimitHandler(_req: Request, res: Response): void {
  sendError(
    res,
    429,
    'Too many requests. Please wait and try again shortly.',
    'RATE_LIMITED'
  );
}

export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      429,
      'Too many authentication attempts. Please try again in 15 minutes.',
      'AUTH_RATE_LIMITED'
    );
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    sendError(
      res,
      429,
      'Hourly AI request limit reached. Please try again later.',
      'AI_RATE_LIMITED'
    );
  },
});
