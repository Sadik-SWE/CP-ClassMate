import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as notificationsService from './notifications.service.ts';
import type { ListNotificationsQuery } from './notifications.validation.ts';

export async function listMyNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const query = req.validated?.query as ListNotificationsQuery;
    const { notifications, unreadCount, meta } =
      await notificationsService.listMyNotifications(req.authUser.id, query);
    sendSuccess(
      res,
      200,
      'Notifications retrieved.',
      { notifications, unreadCount },
      meta
    );
  } catch (err) {
    next(err);
  }
}

export async function markRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { notificationId } = (req.validated?.params ?? {}) as {
      notificationId: string;
    };
    const notification = await notificationsService.markNotificationRead(
      req.authUser.id,
      notificationId
    );
    sendSuccess(res, 200, 'Notification marked as read.', { notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const updatedCount = await notificationsService.markAllNotificationsRead(
      req.authUser.id
    );
    sendSuccess(res, 200, 'All notifications marked as read.', { updatedCount });
  } catch (err) {
    next(err);
  }
}
