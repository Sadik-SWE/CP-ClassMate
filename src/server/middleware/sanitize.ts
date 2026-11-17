import type { NextFunction, Request, Response } from 'express';
import sanitizeHtml from 'sanitize-html';

function stripDollarKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDollarKeys);
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) {
        continue;
      }
      clean[key] = stripDollarKeys(val);
    }
    return clean;
  }
  return value;
}

export function sanitizeNoSqlMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = stripDollarKeys(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = stripDollarKeys(req.query) as Record<string, unknown>;
    for (const key of Object.keys(req.query)) {
      if (!(key in sanitizedQuery)) {
        delete req.query[key];
      }
    }
  }
  if (req.params && typeof req.params === 'object') {
    req.params = stripDollarKeys(req.params) as Record<string, string>;
  }
  next();
}

export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'code'],
    allowedAttributes: {},
  }).trim();
}

export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}
