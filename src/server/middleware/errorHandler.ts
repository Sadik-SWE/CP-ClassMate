import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.ts';
import { sendError } from '../utils/apiResponse.ts';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: unknown = null
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND');
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const reqLogger = req.log || logger;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      reqLogger.error({ err, code: err.code }, err.message);
    } else {
      reqLogger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    }
    sendError(res, err.statusCode, err.message, err.code, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(
      res,
      422,
      'Validation failed',
      'VALIDATION_ERROR',
      err.flatten().fieldErrors
    );
    return;
  }

  // Mongoose duplicate key error
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  ) {
    const keyValue =
      'keyValue' in err ? (err as { keyValue?: Record<string, unknown> }).keyValue : null;
    const fields = keyValue ? Object.keys(keyValue) : ['record'];
    sendError(
      res,
      409,
      `Duplicate value for ${fields.join(', ')}`,
      'DUPLICATE_CONFLICT',
      { fields }
    );
    return;
  }

  // Mongoose CastError (invalid ObjectId)
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'CastError'
  ) {
    sendError(res, 400, 'Invalid resource identifier', 'INVALID_ID');
    return;
  }

  reqLogger.error({ err }, 'Unhandled server error');
  sendError(res, 500, 'An unexpected server error occurred', 'INTERNAL_SERVER_ERROR');
}
