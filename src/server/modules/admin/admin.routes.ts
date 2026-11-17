import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import * as adminController from './admin.controller.ts';
import {
  courseIdParamSchema,
  listCoursesQuerySchema,
} from '../courses/courses.validation.ts';
import {
  assignCRSchema,
  changeRoleSchema,
  changeStatusSchema,
  createCourseSchema,
  listAuditLogsQuerySchema,
  listUsersQuerySchema,
  manageEnrollmentSchema,
  updateCourseSchema,
  userIdParamSchema,
} from './admin.validation.ts';

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get(
  '/stats',
  authorize(Permission.ADMIN_STATS_READ),
  adminController.getStats
);

adminRouter.get(
  '/users',
  authorize(Permission.ADMIN_USERS_MANAGE),
  validate({ query: listUsersQuerySchema }),
  adminController.listUsers
);

adminRouter.patch(
  '/users/:userId/role',
  authorize(Permission.ADMIN_USERS_MANAGE),
  validate({ params: userIdParamSchema, body: changeRoleSchema }),
  adminController.changeUserRole
);

adminRouter.patch(
  '/users/:userId/status',
  authorize(Permission.ADMIN_USERS_MANAGE),
  validate({ params: userIdParamSchema, body: changeStatusSchema }),
  adminController.changeUserStatus
);

adminRouter.get(
  '/courses',
  authorize(Permission.ADMIN_COURSES_MANAGE),
  validate({ query: listCoursesQuerySchema }),
  adminController.listCourses
);

adminRouter.post(
  '/courses',
  authorize(Permission.ADMIN_COURSES_MANAGE),
  validate({ body: createCourseSchema }),
  adminController.createCourse
);

adminRouter.patch(
  '/courses/:courseId',
  authorize(Permission.ADMIN_COURSES_MANAGE),
  validate({ params: courseIdParamSchema, body: updateCourseSchema }),
  adminController.updateCourse
);

adminRouter.post(
  '/courses/:courseId/assign-cr',
  authorize(Permission.ADMIN_COURSES_MANAGE),
  validate({ params: courseIdParamSchema, body: assignCRSchema }),
  adminController.assignCR
);

adminRouter.post(
  '/courses/:courseId/enrollments',
  authorize(Permission.ADMIN_COURSES_MANAGE),
  validate({ params: courseIdParamSchema, body: manageEnrollmentSchema }),
  adminController.manageEnrollment
);

adminRouter.get(
  '/audit-logs',
  authorize(Permission.ADMIN_AUDIT_READ),
  validate({ query: listAuditLogsQuerySchema }),
  adminController.listAuditLogs
);

adminRouter.get(
  '/matching-results/export',
  authorize(Permission.ADMIN_MATCHING_EXPORT),
  adminController.exportMatchingResults
);
