import { Router } from 'express';
import { authenticate } from '../../middleware/auth.ts';
import { validate } from '../../middleware/validate.ts';
import * as notificationsController from './notifications.controller.ts';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.validation.ts';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  notificationsController.listMyNotifications
);

notificationsRouter.patch(
  '/:notificationId/read',
  validate({ params: notificationIdParamSchema }),
  notificationsController.markRead
);

notificationsRouter.post('/read-all', notificationsController.markAllRead);
