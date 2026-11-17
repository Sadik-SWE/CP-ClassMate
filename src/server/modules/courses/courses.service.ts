import mongoose from 'mongoose';
import { CourseEnrollmentModel, CourseModel, type ICourse } from './courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import {
  CourseStatus,
  EnrollmentStatus,
  UserRole,
  type CourseDTO,
  type CourseUserSummary,
  type PaginationMeta,
} from '../../../shared/types.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import type { ListCoursesQuery } from './courses.validation.ts';

export interface AuthUserContext {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  crCourseIds: string[];
}

export async function isEnrolled(
  userId: string,
  courseId: string
): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(courseId)) {
    return false;
  }
  const enrollment = await CourseEnrollmentModel.exists({
    userId: new mongoose.Types.ObjectId(userId),
    courseId: new mongoose.Types.ObjectId(courseId),
    status: EnrollmentStatus.ACTIVE,
  });
  return Boolean(enrollment);
}

export async function isAssignedCR(
  userId: string,
  courseId: string
): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(courseId)) {
    return false;
  }
  const exists = await CourseModel.exists({
    _id: new mongoose.Types.ObjectId(courseId),
    crUserIds: new mongoose.Types.ObjectId(userId),
    deletedAt: null,
  });
  return Boolean(exists);
}

export async function isCourseFaculty(
  userId: string,
  courseId: string
): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(courseId)) {
    return false;
  }
  const exists = await CourseModel.exists({
    _id: new mongoose.Types.ObjectId(courseId),
    facultyIds: new mongoose.Types.ObjectId(userId),
    deletedAt: null,
  });
  return Boolean(exists);
}

export async function getCRCourseIds(userId: string): Promise<string[]> {
  if (!mongoose.isValidObjectId(userId)) return [];
  const courses = await CourseModel.find({
    crUserIds: new mongoose.Types.ObjectId(userId),
    deletedAt: null,
  })
    .select('_id')
    .lean();
  return courses.map((c) => c._id.toString());
}

export async function hydrateCourses(
  courses: ICourse[],
  viewer?: AuthUserContext
): Promise<CourseDTO[]> {
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c._id);
  const userIds = new Set<string>();
  for (const c of courses) {
    for (const fid of c.facultyIds) userIds.add(fid.toString());
    for (const cid of c.crUserIds) userIds.add(cid.toString());
  }

  const [users, enrollmentCounts, viewerEnrollments] = await Promise.all([
    UserModel.find({ _id: { $in: Array.from(userIds) }, deletedAt: null })
      .select('name email role studentId department')
      .lean(),
    CourseEnrollmentModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { courseId: { $in: courseIds }, status: EnrollmentStatus.ACTIVE } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
    viewer
      ? CourseEnrollmentModel.find({
          courseId: { $in: courseIds },
          userId: new mongoose.Types.ObjectId(viewer.id),
          status: EnrollmentStatus.ACTIVE,
        })
          .select('courseId')
          .lean()
      : Promise.resolve([]),
  ]);

  const userMap = new Map<string, CourseUserSummary>();
  for (const u of users) {
    userMap.set(u._id.toString(), {
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      studentId: u.studentId ?? null,
      department: u.department,
    });
  }

  const countMap = new Map<string, number>();
  for (const row of enrollmentCounts) {
    countMap.set(row._id.toString(), row.count);
  }

  const enrolledSet = new Set(viewerEnrollments.map((e) => e.courseId.toString()));

  return courses.map((course) => {
    const id = course._id.toString();
    const facultyIds = course.facultyIds.map((fid) => fid.toString());
    const crIds = course.crUserIds.map((cid) => cid.toString());

    return {
      id,
      courseCode: course.courseCode,
      courseName: course.courseName,
      department: course.department,
      semester: course.semester,
      status: course.status,
      faculty: facultyIds
        .map((fid) => userMap.get(fid))
        .filter((u): u is CourseUserSummary => Boolean(u)),
      crs: crIds
        .map((cid) => userMap.get(cid))
        .filter((u): u is CourseUserSummary => Boolean(u)),
      enrollmentCount: countMap.get(id) ?? 0,
      isEnrolled: viewer ? enrolledSet.has(id) : undefined,
      isAssignedCR: viewer ? crIds.includes(viewer.id) : undefined,
      isCourseFaculty: viewer ? facultyIds.includes(viewer.id) : undefined,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  });
}

export async function listCoursesForUser(
  viewer: AuthUserContext,
  query: ListCoursesQuery
): Promise<{ courses: CourseDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (query.status) filter.status = query.status;
  if (query.department) {
    filter.department = { $regex: escapeRegex(query.department), $options: 'i' };
  }
  if (query.semester) {
    filter.semester = { $regex: escapeRegex(query.semester), $options: 'i' };
  }
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [{ courseCode: rx }, { courseName: rx }, { department: rx }];
  }

  if (viewer.role === UserRole.FACULTY) {
    filter.facultyIds = new mongoose.Types.ObjectId(viewer.id);
  } else if (viewer.role === UserRole.STUDENT) {
    const enrollments = await CourseEnrollmentModel.find({
      userId: new mongoose.Types.ObjectId(viewer.id),
      status: EnrollmentStatus.ACTIVE,
    })
      .select('courseId')
      .lean();
    const enrolledIds = enrollments.map((e) => e.courseId);
    const crObjectIds = viewer.crCourseIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const scopedOr = [
      { _id: { $in: [...enrolledIds, ...crObjectIds] } },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: scopedOr }];
      delete filter.$or;
    } else {
      filter.$or = scopedOr;
    }
  }

  const sortDir = query.sortOrder === 'desc' ? -1 : 1;
  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    CourseModel.find(filter)
      .sort({ [query.sortBy]: sortDir })
      .skip(skip)
      .limit(query.limit),
    CourseModel.countDocuments(filter),
  ]);

  const courses = await hydrateCourses(docs, viewer);
  return {
    courses,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getCourseDetailForUser(
  viewer: AuthUserContext,
  courseId: string
): Promise<CourseDTO> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }
  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (viewer.role !== UserRole.ADMIN) {
    const [enrolled, cr, faculty] = await Promise.all([
      isEnrolled(viewer.id, courseId),
      isAssignedCR(viewer.id, courseId),
      isCourseFaculty(viewer.id, courseId),
    ]);
    if (!enrolled && !cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have access to this course'
      );
    }
  }

  const [hydrated] = await hydrateCourses([course], viewer);
  return hydrated;
}

export async function getCourseRosterForUser(
  viewer: AuthUserContext,
  courseId: string
): Promise<{
  course: CourseDTO;
  students: CourseUserSummary[];
}> {
  const course = await getCourseDetailForUser(viewer, courseId);
  if (
    viewer.role === UserRole.STUDENT &&
    !course.isAssignedCR &&
    !course.isEnrolled
  ) {
    throw new AppError(403, 'COURSE_SCOPE_FORBIDDEN', 'Access denied');
  }

  const enrollments = await CourseEnrollmentModel.find({
    courseId: new mongoose.Types.ObjectId(courseId),
    status: EnrollmentStatus.ACTIVE,
  })
    .select('userId')
    .lean();

  const studentIds = enrollments.map((e) => e.userId);
  const students = await UserModel.find({
    _id: { $in: studentIds },
    deletedAt: null,
  })
    .select('name email role studentId department')
    .sort({ name: 1 })
    .lean();

  return {
    course,
    students: students.map((s) => ({
      id: s._id.toString(),
      name: s.name,
      email: s.email,
      role: s.role,
      studentId: s.studentId ?? null,
      department: s.department,
    })),
  };
}

export async function listCourseCatalog(
  viewer: AuthUserContext,
  query: ListCoursesQuery
): Promise<{ courses: CourseDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {
    deletedAt: null,
    status: CourseStatus.ACTIVE,
  };
  if (query.department) {
    filter.department = { $regex: escapeRegex(query.department), $options: 'i' };
  }
  if (query.semester) {
    filter.semester = { $regex: escapeRegex(query.semester), $options: 'i' };
  }
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [{ courseCode: rx }, { courseName: rx }, { department: rx }];
  }

  const sortDir = query.sortOrder === 'desc' ? -1 : 1;
  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    CourseModel.find(filter)
      .sort({ [query.sortBy]: sortDir })
      .skip(skip)
      .limit(query.limit),
    CourseModel.countDocuments(filter),
  ]);

  const courses = await hydrateCourses(docs, viewer);
  return {
    courses,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function selfEnrollInCourse(
  viewer: AuthUserContext,
  courseId: string,
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  if (viewer.role !== UserRole.STUDENT) {
    throw new AppError(
      403,
      'SELF_ENROLL_STUDENT_ONLY',
      'Only student accounts can self-enroll in courses'
    );
  }
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  if (course.status !== CourseStatus.ACTIVE) {
    throw new AppError(
      400,
      'COURSE_ARCHIVED',
      'Cannot self-enroll in an archived course'
    );
  }

  await CourseEnrollmentModel.findOneAndUpdate(
    { courseId: course._id, userId: new mongoose.Types.ObjectId(viewer.id) },
    { $set: { status: EnrollmentStatus.ACTIVE } },
    { upsert: true }
  );

  await recordAuditLog({
    actor: { id: viewer.id, email: viewer.email, role: viewer.role },
    action: 'COURSE_STUDENT_SELF_ENROLLED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: { courseCode: course.courseCode },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course], viewer);
  return hydrated;
}

export async function selfDropCourse(
  viewer: AuthUserContext,
  courseId: string,
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  if (viewer.role !== UserRole.STUDENT) {
    throw new AppError(
      403,
      'SELF_DROP_STUDENT_ONLY',
      'Only student accounts can drop enrollments'
    );
  }
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (course.crUserIds.some((id) => id.toString() === viewer.id)) {
    throw new AppError(
      400,
      'CR_CANNOT_SELF_DROP',
      'Class Representatives cannot drop their assigned course while serving as CR'
    );
  }

  await CourseEnrollmentModel.findOneAndUpdate(
    { courseId: course._id, userId: new mongoose.Types.ObjectId(viewer.id) },
    { $set: { status: EnrollmentStatus.DROPPED } }
  );

  await recordAuditLog({
    actor: { id: viewer.id, email: viewer.email, role: viewer.role },
    action: 'COURSE_STUDENT_SELF_DROPPED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: { courseCode: course.courseCode },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course], viewer);
  return hydrated;
}

export async function getAccessibleCourseIds(
  viewer: AuthUserContext
): Promise<string[]> {
  if (viewer.role === UserRole.ADMIN) {
    const all = await CourseModel.find({ deletedAt: null }).select('_id').lean();
    return all.map((c) => c._id.toString());
  }
  if (viewer.role === UserRole.FACULTY) {
    const taught = await CourseModel.find({
      facultyIds: new mongoose.Types.ObjectId(viewer.id),
      deletedAt: null,
    })
      .select('_id')
      .lean();
    return taught.map((c) => c._id.toString());
  }

  const enrollments = await CourseEnrollmentModel.find({
    userId: new mongoose.Types.ObjectId(viewer.id),
    status: EnrollmentStatus.ACTIVE,
  })
    .select('courseId')
    .lean();

  const ids = new Set<string>([
    ...enrollments.map((e) => e.courseId.toString()),
    ...viewer.crCourseIds,
  ]);
  return Array.from(ids);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
