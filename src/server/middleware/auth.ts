import type { NextFunction, Request, Response } from 'express';
import { connectDatabase, isDatabaseReady } from '../config/db.ts';
import { UserModel } from '../modules/users/users.model.ts';
import {
  getCRCourseIds,
  type AuthUserContext,
} from '../modules/courses/courses.service.ts';
import { verifyAccessToken } from '../utils/crypto.ts';
import { AppError } from './errorHandler.ts';
import { UserStatus } from '../../shared/types.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUserContext;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isDatabaseReady()) {
      await connectDatabase();
      if (!isDatabaseReady()) {
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Database is not connected. Configure MONGODB_URI in the Secrets panel.'
        );
      }
    }

    const authHeader = req.header('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        401,
        'AUTH_UNAUTHORIZED',
        'Missing or malformed Authorization header'
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Missing access token');
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(
        401,
        'AUTH_TOKEN_INVALID',
        'Access token is invalid or expired'
      );
    }

    const user = await UserModel.findOne({
      _id: payload.sub,
      deletedAt: null,
    }).select('email name role status department');

    if (!user) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Account no longer exists');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError(
        403,
        'AUTH_ACCOUNT_INACTIVE',
        `Account status is ${user.status}`
      );
    }

    const crCourseIds = await getCRCourseIds(user._id.toString());

    req.authUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
      crCourseIds,
    };

    next();
  } catch (err) {
    next(err);
  }
}
