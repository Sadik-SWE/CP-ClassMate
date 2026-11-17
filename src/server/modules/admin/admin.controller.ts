import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as adminService from './admin.service.ts';
import type { UserRole, UserStatus } from '../../../shared/types.ts';
import type { ListCoursesQuery } from '../courses/courses.validation.ts';
import type {
  CreateCourseInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  UpdateCourseInput,
} from './admin.validation.ts';

function getActorAndMeta(req: Request) {
  if (!req.authUser) {
    throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
  }
  return {
    actor: {
      id: req.authUser.id,
      email: req.authUser.email,
      role: req.authUser.role,
    },
    reqMeta: {
      ip: req.ip || null,
      requestId: req.requestId || null,
      userAgent: req.header('user-agent') || null,
    },
  };
}

export async function getStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await adminService.getAdminStats();
    sendSuccess(res, 200, 'Platform statistics retrieved.', { stats });
  } catch (err) {
    next(err);
  }
}

export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListUsersQuery;
    const { users, meta } = await adminService.listUsers(query);
    sendSuccess(res, 200, 'Users retrieved.', { users }, meta);
  } catch (err) {
    next(err);
  }
}

export async function changeUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { userId } = (req.validated?.params ?? {}) as { userId: string };
    const { role } = (req.validated?.body ?? {}) as { role: UserRole };
    const user = await adminService.changeUserRole(actor, userId, role, reqMeta);
    sendSuccess(res, 200, 'User role updated.', { user });
  } catch (err) {
    next(err);
  }
}

export async function changeUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { userId } = (req.validated?.params ?? {}) as { userId: string };
    const { status } = (req.validated?.body ?? {}) as { status: UserStatus };
    const user = await adminService.changeUserStatus(actor, userId, status, reqMeta);
    sendSuccess(res, 200, 'User status updated.', { user });
  } catch (err) {
    next(err);
  }
}

export async function listCourses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListCoursesQuery;
    const { courses, meta } = await adminService.listAdminCourses(query);
    sendSuccess(res, 200, 'Courses retrieved.', { courses }, meta);
  } catch (err) {
    next(err);
  }
}

export async function createCourse(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const input = req.validated?.body as CreateCourseInput;
    const course = await adminService.createCourse(actor, input, reqMeta);
    sendSuccess(res, 201, 'Course created successfully.', { course });
  } catch (err) {
    next(err);
  }
}

export async function updateCourse(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const input = req.validated?.body as UpdateCourseInput;
    const course = await adminService.updateCourse(actor, courseId, input, reqMeta);
    sendSuccess(res, 200, 'Course updated successfully.', { course });
  } catch (err) {
    next(err);
  }
}

export async function assignCR(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const { userId, action } = (req.validated?.body ?? {}) as {
      userId: string;
      action: 'ADD' | 'REMOVE';
    };
    const course = await adminService.assignCRToCourse(
      actor,
      courseId,
      userId,
      action,
      reqMeta
    );
    sendSuccess(
      res,
      200,
      action === 'ADD'
        ? 'Class Representative assigned.'
        : 'Class Representative removed.',
      { course }
    );
  } catch (err) {
    next(err);
  }
}

export async function manageEnrollment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const { userId, action } = (req.validated?.body ?? {}) as {
      userId: string;
      action: 'ENROLL' | 'DROP';
    };
    const course = await adminService.manageCourseEnrollment(
      actor,
      courseId,
      userId,
      action,
      reqMeta
    );
    sendSuccess(
      res,
      200,
      action === 'ENROLL' ? 'Student enrolled in course.' : 'Student removed from course.',
      { course }
    );
  } catch (err) {
    next(err);
  }
}

export async function listAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListAuditLogsQuery;
    const { logs, meta } = await adminService.listAuditLogs(query);
    sendSuccess(res, 200, 'Audit logs retrieved.', { logs }, meta);
  } catch (err) {
    next(err);
  }
}

export async function exportMatchingResults(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { actor, reqMeta } = getActorAndMeta(req);
    const { exportMatchingResultsCsv } = await import(
      '../collaboration/matching.service.ts'
    );
    const csv = await exportMatchingResultsCsv();
    await adminService.recordAuditLog({
      actor,
      action: 'MATCHING_RESULTS_EXPORTED',
      targetType: 'TEAM_MATCH_REQUEST',
      reqMeta,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="classmate-matching-results.csv"'
    );
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}
