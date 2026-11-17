import pino from 'pino';
import { env } from '../config/env.ts';

export const logger = pino({
  level: env.isDev ? 'debug' : 'info',
  base: {
    service: 'classmate-api',
    env: env.nodeEnv,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'GEMINI_API_KEY',
    ],
    censor: '[REDACTED]',
  },
});
