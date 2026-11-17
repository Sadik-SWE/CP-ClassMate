import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { logger } from '../utils/logger.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.originalUrl,
  });

  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/health')) {
      req.log.info(
        { statusCode: res.statusCode, durationMs },
        'HTTP request completed'
      );
    }
  });

  next();
}
