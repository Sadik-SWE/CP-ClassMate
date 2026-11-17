import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import * as announcementsController from './announcements.controller.ts';
import {
  announcementIdParamSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './announcements.validation.ts';

export const announcementsRouter = Router();

announcementsRouter.use(authenticate);

announcementsRouter.get(
  '/',
  authorize(Permission.ANNOUNCEMENT_READ),
  validate({ query: listAnnouncementsQuerySchema }),
  announcementsController.listAnnouncements
);

announcementsRouter.post(
  '/',
  authorize(Permission.ANNOUNCEMENT_MANAGE_COURSE),
  validate({ body: createAnnouncementSchema }),
  announcementsController.createAnnouncement
);

announcementsRouter.patch(
  '/:announcementId',
  authorize(Permission.ANNOUNCEMENT_MANAGE_COURSE),
  validate({ params: announcementIdParamSchema, body: updateAnnouncementSchema }),
  announcementsController.updateAnnouncement
);

announcementsRouter.post(
  '/:announcementId/withdraw',
  authorize(Permission.ANNOUNCEMENT_MANAGE_COURSE),
  validate({ params: announcementIdParamSchema }),
  announcementsController.withdrawAnnouncement
);
