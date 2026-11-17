import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as usersService from './users.service.ts';
import type { UpdateProfileInput } from './users.validation.ts';

export async function getMyProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const user = await usersService.getUserProfileById(req.authUser.id);
    sendSuccess(res, 200, 'Profile fetched.', { user });
  } catch (err) {
    next(err);
  }
}

export async function updateMyProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const input = req.validated?.body as UpdateProfileInput;
    const user = await usersService.updateMyProfile(req.authUser.id, input);
    sendSuccess(res, 200, 'Profile updated successfully.', { user });
  } catch (err) {
    next(err);
  }
}
