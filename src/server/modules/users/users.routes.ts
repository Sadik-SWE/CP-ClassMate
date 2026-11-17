import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import * as usersController from './users.controller.ts';
import { updateProfileSchema } from './users.validation.ts';

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get(
  '/me',
  authorize(Permission.USER_READ_SELF),
  usersController.getMyProfile
);

usersRouter.patch(
  '/me',
  authorize(Permission.USER_UPDATE_SELF),
  validate({ body: updateProfileSchema }),
  usersController.updateMyProfile
);
