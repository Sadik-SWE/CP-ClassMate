import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize, requireCourseScope } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import { courseIdParamSchema } from '../courses/courses.validation.ts';
import * as presentationsController from './presentations.controller.ts';
import {
  coordinatePresentationTopicSchema,
  createPresentationTopicSchema,
  listPresentationTopicsQuerySchema,
  topicIdParamSchema,
  updatePresentationProgressSchema,
} from './presentations.validation.ts';

export const presentationsRouter = Router();

presentationsRouter.use(authenticate);

presentationsRouter.get(
  '/courses/:courseId',
  authorize(Permission.PRESENTATION_READ),
  validate({
    params: courseIdParamSchema,
    query: listPresentationTopicsQuerySchema,
  }),
  requireCourseScope(['ADMIN', 'FACULTY', 'CR', 'ENROLLED']),
  presentationsController.listCourseTopics
);

presentationsRouter.post(
  '/courses/:courseId',
  authorize(Permission.PRESENTATION_ASSIGN_FACULTY),
  validate({
    params: courseIdParamSchema,
    body: createPresentationTopicSchema,
  }),
  requireCourseScope(['ADMIN', 'FACULTY']),
  presentationsController.createTopic
);

presentationsRouter.patch(
  '/:topicId/coordinate',
  authorize(Permission.PRESENTATION_COORDINATE_CR),
  validate({
    params: topicIdParamSchema,
    body: coordinatePresentationTopicSchema,
  }),
  presentationsController.coordinateTopic
);

presentationsRouter.patch(
  '/:topicId/progress',
  authorize(Permission.PRESENTATION_ASSIGN_FACULTY),
  validate({
    params: topicIdParamSchema,
    body: updatePresentationProgressSchema,
  }),
  presentationsController.updateProgress
);

presentationsRouter.delete(
  '/:topicId',
  authorize(Permission.PRESENTATION_ASSIGN_FACULTY),
  validate({ params: topicIdParamSchema }),
  presentationsController.deleteTopic
);
