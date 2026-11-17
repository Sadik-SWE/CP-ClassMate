import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as coursesService from './courses.service.ts';
import type { ListCoursesQuery } from './courses.validation.ts';

export async function listMyCourses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const query = req.validated?.query as ListCoursesQuery;
    const { courses, meta } = await coursesService.listCoursesForUser(
      req.authUser,
      query
    );
    sendSuccess(res, 200, 'Courses retrieved.', { courses }, meta);
  } catch (err) {
    next(err);
  }
}

export async function getCourseDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const course = await coursesService.getCourseDetailForUser(
      req.authUser,
      courseId
    );
    sendSuccess(res, 200, 'Course details retrieved.', { course });
  } catch (err) {
    next(err);
  }
}

export async function getCourseRoster(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const roster = await coursesService.getCourseRosterForUser(
      req.authUser,
      courseId
    );
    sendSuccess(res, 200, 'Course roster retrieved.', roster);
  } catch (err) {
    next(err);
  }
}

export async function listCatalog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const query = req.validated?.query as ListCoursesQuery;
    const { courses, meta } = await coursesService.listCourseCatalog(
      req.authUser,
      query
    );
    sendSuccess(res, 200, 'Course catalog retrieved.', { courses }, meta);
  } catch (err) {
    next(err);
  }
}

export async function selfEnroll(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const course = await coursesService.selfEnrollInCourse(
      req.authUser,
      courseId,
      {
        ip: req.ip || null,
        requestId: req.requestId || null,
        userAgent: req.header('user-agent') || null,
      }
    );
    sendSuccess(res, 200, `Enrolled in ${course.courseCode}.`, { course });
  } catch (err) {
    next(err);
  }
}

export async function selfDrop(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const course = await coursesService.selfDropCourse(
      req.authUser,
      courseId,
      {
        ip: req.ip || null,
        requestId: req.requestId || null,
        userAgent: req.header('user-agent') || null,
      }
    );
    sendSuccess(res, 200, `Dropped ${course.courseCode}.`, { course });
  } catch (err) {
    next(err);
  }
}
