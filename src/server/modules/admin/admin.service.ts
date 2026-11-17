import mongoose from 'mongoose';
import { AuditLogModel } from './admin.model.ts';
import { UserModel } from '../users/users.model.ts';
import { CourseEnrollmentModel, CourseModel } from '../courses/courses.model.ts';
import { ResourceModel } from '../resources/resources.model.ts';
import { QuizAttemptModel, QuizQuestionModel } from '../quizzes/quizzes.model.ts';
import { AiUsageLogModel, DocumentChunkModel } from '../ai/ai.model.ts';
import { toPublicUser } from '../users/users.service.ts';
import { hydrateCourses } from '../courses/courses.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import { logger } from '../../utils/logger.ts';
import {
  CourseStatus,
  EnrollmentStatus,
  UserRole,
  UserStatus,
  type AdminStatsDTO,
  type AuditLogDTO,
  type CourseDTO,
  type PaginationMeta,
  type PublicUser,
} from '../../../shared/types.ts';
import type {
  CreateCourseInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  UpdateCourseInput,
} from './admin.validation.ts';
import type { ListCoursesQuery } from '../courses/courses.validation.ts';

export interface RequestMeta {
  ip?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
}

export interface ActorSummary {
  id: string | null;
  email: string;
  role: string;
}

export async function recordAuditLog(params: {
  actor: ActorSummary;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  reqMeta?: RequestMeta;
}): Promise<void> {
  try {
    await AuditLogModel.create({
      actorId:
        params.actor.id && mongoose.isValidObjectId(params.actor.id)
          ? new mongoose.Types.ObjectId(params.actor.id)
          : null,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      metadata: params.metadata ?? {},
      ip: params.reqMeta?.ip ?? null,
      requestId: params.reqMeta?.requestId ?? null,
    });
  } catch (err) {
    logger.warn({ err, action: params.action }, 'Failed to persist audit log');
  }
}

export async function listUsers(
  query: ListUsersQuery
): Promise<{ users: PublicUser[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (query.status) {
    filter.status = query.status;
  }
  if (query.department) {
    filter.department = { $regex: escapeRegex(query.department), $options: 'i' };
  }
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { studentId: rx }, { department: rx }];
  }

  const activeCoursesWithCRs = await CourseModel.find({
    deletedAt: null,
    crUserIds: { $exists: true, $ne: [] },
  })
    .select('_id crUserIds')
    .lean();

  const userCRMap = new Map<string, string[]>();
  for (const c of activeCoursesWithCRs) {
    for (const crId of c.crUserIds) {
      const uid = crId.toString();
      const existing = userCRMap.get(uid) || [];
      existing.push(c._id.toString());
      userCRMap.set(uid, existing);
    }
  }

  if (query.role === 'CR') {
    const crUserIds = Array.from(userCRMap.keys());
    filter.role = UserRole.STUDENT;
    filter._id = {
      $in: crUserIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  } else if (query.role) {
    filter.role = query.role;
  }

  const sortDir = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ [query.sortBy]: sortDir })
      .skip(skip)
      .limit(query.limit),
    UserModel.countDocuments(filter),
  ]);

  const users = docs.map((doc) =>
    toPublicUser(doc, userCRMap.get(doc._id.toString()) || [])
  );

  return {
    users,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function changeUserRole(
  actor: ActorSummary,
  targetUserId: string,
  newRole: UserRole,
  reqMeta?: RequestMeta
): Promise<PublicUser> {
  if (!mongoose.isValidObjectId(targetUserId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  if (actor.id === targetUserId && newRole !== UserRole.ADMIN) {
    throw new AppError(
      400,
      'SELF_ROLE_DEMOTION_FORBIDDEN',
      'Administrators cannot remove their own ADMIN role'
    );
  }

  const user = await UserModel.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const previousRole = user.role;
  user.role = newRole;
  await user.save();

  if (newRole !== UserRole.STUDENT) {
    await CourseModel.updateMany(
      { crUserIds: user._id },
      { $pull: { crUserIds: user._id } }
    );
  }

  await recordAuditLog({
    actor,
    action: 'USER_ROLE_CHANGED',
    targetType: 'USER',
    targetId: user._id.toString(),
    metadata: { previousRole, newRole, targetEmail: user.email },
    reqMeta,
  });

  const crCourses = await CourseModel.find({ crUserIds: user._id, deletedAt: null })
    .select('_id')
    .lean();
  return toPublicUser(
    user,
    crCourses.map((c) => c._id.toString())
  );
}

export async function changeUserStatus(
  actor: ActorSummary,
  targetUserId: string,
  newStatus: UserStatus,
  reqMeta?: RequestMeta
): Promise<PublicUser> {
  if (!mongoose.isValidObjectId(targetUserId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  if (actor.id === targetUserId && newStatus !== UserStatus.ACTIVE) {
    throw new AppError(
      400,
      'SELF_SUSPEND_FORBIDDEN',
      'Administrators cannot suspend or deactivate their own account'
    );
  }

  const user = await UserModel.findOne({ _id: targetUserId, deletedAt: null });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const previousStatus = user.status;
  user.status = newStatus;
  await user.save();

  await recordAuditLog({
    actor,
    action: 'USER_STATUS_CHANGED',
    targetType: 'USER',
    targetId: user._id.toString(),
    metadata: { previousStatus, newStatus, targetEmail: user.email },
    reqMeta,
  });

  const crCourses = await CourseModel.find({ crUserIds: user._id, deletedAt: null })
    .select('_id')
    .lean();
  return toPublicUser(
    user,
    crCourses.map((c) => c._id.toString())
  );
}

export async function listAdminCourses(
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

  const sortDir = query.sortOrder === 'desc' ? -1 : 1;
  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    CourseModel.find(filter)
      .sort({ [query.sortBy]: sortDir })
      .skip(skip)
      .limit(query.limit),
    CourseModel.countDocuments(filter),
  ]);

  const courses = await hydrateCourses(docs);
  return {
    courses,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function createCourse(
  actor: ActorSummary,
  input: CreateCourseInput,
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  const facultyIds = await validateUserIdsWithRole(input.facultyIds, [UserRole.FACULTY]);
  const crUserIds = await validateUserIdsWithRole(input.crUserIds, [UserRole.STUDENT]);

  const course = await CourseModel.create({
    courseCode: sanitizePlainText(input.courseCode).toUpperCase(),
    courseName: sanitizePlainText(input.courseName),
    department: sanitizePlainText(input.department),
    semester: sanitizePlainText(input.semester),
    facultyIds,
    crUserIds,
    status: input.status,
  });

  for (const crId of crUserIds) {
    await CourseEnrollmentModel.findOneAndUpdate(
      { courseId: course._id, userId: crId },
      { $set: { status: EnrollmentStatus.ACTIVE } },
      { upsert: true }
    );
  }

  await recordAuditLog({
    actor,
    action: 'COURSE_CREATED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      courseName: course.courseName,
      semester: course.semester,
    },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course]);
  return hydrated;
}

export async function updateCourse(
  actor: ActorSummary,
  courseId: string,
  input: UpdateCourseInput,
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }
  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (input.courseCode !== undefined) {
    course.courseCode = sanitizePlainText(input.courseCode).toUpperCase();
  }
  if (input.courseName !== undefined) {
    course.courseName = sanitizePlainText(input.courseName);
  }
  if (input.department !== undefined) {
    course.department = sanitizePlainText(input.department);
  }
  if (input.semester !== undefined) {
    course.semester = sanitizePlainText(input.semester);
  }
  if (input.status !== undefined) {
    course.status = input.status;
  }
  if (input.facultyIds !== undefined) {
    course.facultyIds = await validateUserIdsWithRole(input.facultyIds, [
      UserRole.FACULTY,
    ]);
  }
  if (input.crUserIds !== undefined) {
    const crObjectIds = await validateUserIdsWithRole(input.crUserIds, [
      UserRole.STUDENT,
    ]);
    course.crUserIds = crObjectIds;
    for (const crId of crObjectIds) {
      await CourseEnrollmentModel.findOneAndUpdate(
        { courseId: course._id, userId: crId },
        { $set: { status: EnrollmentStatus.ACTIVE } },
        { upsert: true }
      );
    }
  }

  await course.save();

  await recordAuditLog({
    actor,
    action: 'COURSE_UPDATED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      updatedFields: Object.keys(input),
    },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course]);
  return hydrated;
}

export async function assignCRToCourse(
  actor: ActorSummary,
  courseId: string,
  userId: string,
  action: 'ADD' | 'REMOVE',
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  if (!mongoose.isValidObjectId(courseId) || !mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course or user ID');
  }

  const [course, user] = await Promise.all([
    CourseModel.findOne({ _id: courseId, deletedAt: null }),
    UserModel.findOne({ _id: userId, deletedAt: null }),
  ]);

  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  if (action === 'ADD' && user.role !== UserRole.STUDENT) {
    throw new AppError(
      400,
      'INVALID_CR_ROLE',
      'Only users with the STUDENT role can be assigned as a Course CR'
    );
  }
  if (action === 'ADD' && user.status !== UserStatus.ACTIVE) {
    throw new AppError(
      400,
      'USER_NOT_ACTIVE',
      'Only ACTIVE students can be assigned as CR'
    );
  }

  if (action === 'ADD') {
    const already = course.crUserIds.some((id) => id.toString() === userId);
    if (!already) {
      course.crUserIds.push(user._id);
      await course.save();
    }
    await CourseEnrollmentModel.findOneAndUpdate(
      { courseId: course._id, userId: user._id },
      { $set: { status: EnrollmentStatus.ACTIVE } },
      { upsert: true }
    );
  } else {
    course.crUserIds = course.crUserIds.filter((id) => id.toString() !== userId);
    await course.save();
  }

  await recordAuditLog({
    actor,
    action: action === 'ADD' ? 'COURSE_CR_ASSIGNED' : 'COURSE_CR_REMOVED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      crUserId: user._id.toString(),
      crEmail: user.email,
    },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course]);
  return hydrated;
}

export async function manageCourseEnrollment(
  actor: ActorSummary,
  courseId: string,
  userId: string,
  action: 'ENROLL' | 'DROP',
  reqMeta?: RequestMeta
): Promise<CourseDTO> {
  if (!mongoose.isValidObjectId(courseId) || !mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course or user ID');
  }

  const [course, user] = await Promise.all([
    CourseModel.findOne({ _id: courseId, deletedAt: null }),
    UserModel.findOne({ _id: userId, deletedAt: null }),
  ]);

  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  if (user.role !== UserRole.STUDENT) {
    throw new AppError(
      400,
      'INVALID_ENROLLMENT_ROLE',
      'Only STUDENT accounts can be enrolled in courses'
    );
  }

  if (action === 'ENROLL') {
    await CourseEnrollmentModel.findOneAndUpdate(
      { courseId: course._id, userId: user._id },
      { $set: { status: EnrollmentStatus.ACTIVE } },
      { upsert: true }
    );
  } else {
    await CourseEnrollmentModel.findOneAndUpdate(
      { courseId: course._id, userId: user._id },
      { $set: { status: EnrollmentStatus.DROPPED } }
    );
    course.crUserIds = course.crUserIds.filter((id) => id.toString() !== userId);
    await course.save();
  }

  await recordAuditLog({
    actor,
    action: action === 'ENROLL' ? 'COURSE_STUDENT_ENROLLED' : 'COURSE_STUDENT_DROPPED',
    targetType: 'COURSE',
    targetId: course._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      studentId: user._id.toString(),
      studentEmail: user.email,
    },
    reqMeta,
  });

  const [hydrated] = await hydrateCourses([course]);
  return hydrated;
}

export async function listAuditLogs(
  query: ListAuditLogsQuery
): Promise<{ logs: AuditLogDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {};
  if (query.action) {
    filter.action = { $regex: escapeRegex(query.action), $options: 'i' };
  }
  if (query.actorEmail) {
    filter.actorEmail = { $regex: escapeRegex(query.actorEmail), $options: 'i' };
  }
  if (query.targetType) {
    filter.targetType = { $regex: escapeRegex(query.targetType), $options: 'i' };
  }

  const sortDir = query.sortOrder === 'asc' ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const [docs, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ createdAt: sortDir })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);

  const logs: AuditLogDTO[] = docs.map((doc) => ({
    id: doc._id.toString(),
    actorId: doc.actorId ? doc.actorId.toString() : null,
    actorEmail: doc.actorEmail,
    actorRole: doc.actorRole,
    action: doc.action,
    targetType: doc.targetType,
    targetId: doc.targetId ?? null,
    metadata: (doc.metadata as Record<string, unknown>) ?? {},
    ip: doc.ip ?? null,
    requestId: doc.requestId ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  }));

  return {
    logs,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getAdminStats(): Promise<AdminStatsDTO> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const [
    totalUsers,
    activeUsers,
    pendingFaculty,
    suspendedUsers,
    studentCount,
    facultyCount,
    adminCount,
    coursesWithCRs,
    totalCourses,
    activeCourses,
    archivedCourses,
    activeEnrollments,
    totalUploads,
    readyUploads,
    processingUploads,
    failedUploads,
    totalAttempts,
    submittedAttempts,
    bankQuestions,
    aiUsageAgg,
    todayAiUsageAgg,
    chunkTokensAgg,
    auditLogsTotal,
  ] = await Promise.all([
    UserModel.countDocuments({ deletedAt: null }),
    UserModel.countDocuments({ deletedAt: null, status: UserStatus.ACTIVE }),
    UserModel.countDocuments({
      deletedAt: null,
      role: UserRole.FACULTY,
      status: UserStatus.PENDING,
    }),
    UserModel.countDocuments({ deletedAt: null, status: UserStatus.SUSPENDED }),
    UserModel.countDocuments({ deletedAt: null, role: UserRole.STUDENT }),
    UserModel.countDocuments({ deletedAt: null, role: UserRole.FACULTY }),
    UserModel.countDocuments({ deletedAt: null, role: UserRole.ADMIN }),
    CourseModel.find({ deletedAt: null, crUserIds: { $ne: [] } })
      .select('crUserIds')
      .lean(),
    CourseModel.countDocuments({ deletedAt: null }),
    CourseModel.countDocuments({ deletedAt: null, status: CourseStatus.ACTIVE }),
    CourseModel.countDocuments({ deletedAt: null, status: CourseStatus.ARCHIVED }),
    CourseEnrollmentModel.countDocuments({ status: EnrollmentStatus.ACTIVE }),
    ResourceModel.countDocuments({ deletedAt: null }),
    ResourceModel.countDocuments({ deletedAt: null, status: 'READY' }),
    ResourceModel.countDocuments({ deletedAt: null, status: 'PROCESSING' }),
    ResourceModel.countDocuments({ deletedAt: null, status: 'FAILED' }),
    QuizAttemptModel.countDocuments({}),
    QuizAttemptModel.countDocuments({ status: 'SUBMITTED' }),
    QuizQuestionModel.countDocuments({ status: 'APPROVED' }),
    AiUsageLogModel.aggregate([{ $group: { _id: null, total: { $sum: '$count' } } }]),
    AiUsageLogModel.aggregate([
      { $match: { dateKey } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),
    DocumentChunkModel.aggregate([{ $group: { _id: null, totalTokens: { $sum: '$tokenCount' } } }]),
    AuditLogModel.countDocuments({}),
  ]);

  const distinctCRIds = new Set<string>();
  for (const c of coursesWithCRs) {
    for (const id of c.crUserIds) {
      distinctCRIds.add(id.toString());
    }
  }

  const totalAiRequests = aiUsageAgg[0]?.total ?? 0;
  const todayAiRequests = todayAiUsageAgg[0]?.total ?? 0;
  const chunkTokens = chunkTokensAgg[0]?.totalTokens ?? 0;
  const estimatedTokens = chunkTokens + totalAiRequests * 350;

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      pendingFaculty,
      suspended: suspendedUsers,
      byRole: {
        STUDENT: Math.max(0, studentCount - distinctCRIds.size),
        CR: distinctCRIds.size,
        FACULTY: facultyCount,
        ADMIN: adminCount,
      },
    },
    courses: {
      total: totalCourses,
      active: activeCourses,
      archived: archivedCourses,
    },
    enrollments: {
      active: activeEnrollments,
    },
    uploads: {
      total: totalUploads,
      ready: readyUploads,
      processing: processingUploads,
      failed: failedUploads,
    },
    quizAttempts: {
      total: totalAttempts,
      submitted: submittedAttempts,
      bankQuestions,
    },
    aiUsage: {
      totalRequests: totalAiRequests,
      todayRequests: todayAiRequests,
      estimatedTokens,
    },
    auditLogsTotal,
  };
}

async function validateUserIdsWithRole(
  ids: string[],
  allowedRoles: UserRole[]
): Promise<mongoose.Types.ObjectId[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];

  for (const id of uniqueIds) {
    if (!mongoose.isValidObjectId(id)) {
      throw new AppError(400, 'INVALID_ID', `Invalid user ID: ${id}`);
    }
  }

  const users = await UserModel.find({
    _id: { $in: uniqueIds },
    deletedAt: null,
  }).select('_id role status');

  if (users.length !== uniqueIds.length) {
    throw new AppError(404, 'USER_NOT_FOUND', 'One or more assigned users were not found');
  }

  for (const user of users) {
    if (!allowedRoles.includes(user.role)) {
      throw new AppError(
        400,
        'INVALID_ASSIGNMENT_ROLE',
        `User role ${user.role} cannot be assigned here`
      );
    }
  }

  return users.map((u) => u._id);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
