import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize, requireCourseScope } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import * as coursesController from './courses.controller.ts';
import {
  courseIdParamSchema,
  listCoursesQuerySchema,
} from './courses.validation.ts';

export const coursesRouter = Router();

coursesRouter.use(authenticate);

coursesRouter.get(
  '/',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ query: listCoursesQuerySchema }),
  coursesController.listMyCourses
);

coursesRouter.get(
  '/catalog',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ query: listCoursesQuerySchema }),
  coursesController.listCatalog
);

coursesRouter.post(
  '/:courseId/enroll',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ params: courseIdParamSchema }),
  coursesController.selfEnroll
);

coursesRouter.delete(
  '/:courseId/enroll',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ params: courseIdParamSchema }),
  coursesController.selfDrop
);

coursesRouter.get(
  '/:courseId',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ params: courseIdParamSchema }),
  requireCourseScope(['ADMIN', 'FACULTY', 'CR', 'ENROLLED']),
  coursesController.getCourseDetail
);

coursesRouter.get(
  '/:courseId/roster',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ params: courseIdParamSchema }),
  requireCourseScope(['ADMIN', 'FACULTY', 'CR', 'ENROLLED']),
  coursesController.getCourseRoster
);
