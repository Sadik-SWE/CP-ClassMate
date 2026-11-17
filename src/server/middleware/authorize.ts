import type { NextFunction, Request, Response } from 'express';
import {
  CR_EXTRA_PERMISSIONS,
  hasRolePermission,
  type Permission,
} from '../config/permissions.ts';
import {
  isAssignedCR,
  isCourseFaculty,
  isEnrolled,
} from '../modules/courses/courses.service.ts';
import { UserRole } from '../../shared/types.ts';
import { AppError } from './errorHandler.ts';

export type CourseScopeType = 'ADMIN' | 'FACULTY' | 'CR' | 'ENROLLED';

export function authorize(...requiredPermissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      next(new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required'));
      return;
    }

    const hasAll = requiredPermissions.every((perm) => {
      if (hasRolePermission(user.role, perm)) {
        return true;
      }
      if (
        user.role === UserRole.STUDENT &&
        user.crCourseIds.length > 0 &&
        CR_EXTRA_PERMISSIONS.has(perm)
      ) {
        return true;
      }
      return false;
    });

    if (!hasAll) {
      next(
        new AppError(
          403,
          'AUTH_FORBIDDEN',
          'You do not have permission to perform this action'
        )
      );
      return;
    }

    next();
  };
}

export function requireCourseScope(
  allowedScopes: CourseScopeType[],
  courseIdParam = 'courseId'
) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.authUser;
      if (!user) {
        throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
      }

      if (allowedScopes.includes('ADMIN') && user.role === UserRole.ADMIN) {
        next();
        return;
      }

      const courseId =
        req.params?.[courseIdParam] ||
        (typeof req.body?.courseId === 'string' ? req.body.courseId : '');

      if (!courseId) {
        throw new AppError(400, 'COURSE_ID_REQUIRED', 'Course ID is required');
      }

      const checks: Promise<boolean>[] = [];

      if (allowedScopes.includes('FACULTY') && user.role === UserRole.FACULTY) {
        checks.push(isCourseFaculty(user.id, courseId));
      }
      if (allowedScopes.includes('CR') && user.role === UserRole.STUDENT) {
        checks.push(isAssignedCR(user.id, courseId));
      }
      if (allowedScopes.includes('ENROLLED') && user.role === UserRole.STUDENT) {
        checks.push(isEnrolled(user.id, courseId));
      }

      const results = await Promise.all(checks);
      if (results.some(Boolean)) {
        next();
        return;
      }

      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have the required relationship to this course'
      );
    } catch (err) {
      next(err);
    }
  };
}
