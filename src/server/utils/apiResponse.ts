import type { Response } from 'express';
import type { ApiErrorResponse, ApiSuccessResponse, PaginationMeta } from '../../shared/types.ts';

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T,
  meta: PaginationMeta | null = null
): Response {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
    meta,
  };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: string,
  details: unknown = null
): Response {
  const payload: ApiErrorResponse = {
    success: false,
    message,
    error: {
      code,
      details,
    },
  };
  return res.status(statusCode).json(payload);
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
