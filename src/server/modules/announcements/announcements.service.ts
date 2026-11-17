import mongoose from 'mongoose';
import { AnnouncementModel, type IAnnouncement } from './announcements.model.ts';
import { CourseModel } from '../courses/courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import {
  getAccessibleCourseIds,
  isAssignedCR,
  isCourseFaculty,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import { notifyCourseMembers } from '../notifications/notifications.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import {
  sanitizePlainText,
  sanitizeRichText,
} from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import {
  AnnouncementScope,
  AnnouncementStatus,
  CourseStatus,
  NotificationType,
  UserRole,
  type AnnouncementDTO,
  type PaginationMeta,
} from '../../../shared/types.ts';
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from './announcements.validation.ts';

async function hydrateAnnouncements(
  docs: IAnnouncement[]
): Promise<AnnouncementDTO[]> {
  if (docs.length === 0) return [];

  const authorIds = Array.from(new Set(docs.map((d) => d.authorId.toString())));
  const courseIds = Array.from(
    new Set(
      docs
        .map((d) => (d.courseId ? d.courseId.toString() : null))
        .filter((id): id is string => Boolean(id))
    )
  );

  const [authors, courses] = await Promise.all([
    UserModel.find({ _id: { $in: authorIds } })
      .select('name role')
      .lean(),
    CourseModel.find({ _id: { $in: courseIds } })
      .select('courseCode courseName')
      .lean(),
  ]);

  const authorMap = new Map(
    authors.map((a) => [
      a._id.toString(),
      { id: a._id.toString(), name: a.name, role: a.role },
    ])
  );
  const courseMap = new Map(
    courses.map((c) => [
      c._id.toString(),
      { courseCode: c.courseCode, courseName: c.courseName },
    ])
  );

  return docs.map((doc) => {
    const cid = doc.courseId ? doc.courseId.toString() : null;
    const courseInfo = cid ? courseMap.get(cid) : null;
    return {
      id: doc._id.toString(),
      title: doc.title,
      content: doc.content,
      scope: doc.scope,
      courseId: cid,
      courseCode: courseInfo?.courseCode ?? null,
      courseName: courseInfo?.courseName ?? null,
      targetCourseIds: doc.targetCourseIds.map((id) => id.toString()),
      pinned: Boolean(doc.pinned),
      status: doc.status,
      author: authorMap.get(doc.authorId.toString()) || {
        id: doc.authorId.toString(),
        name: 'Instructor',
        role: UserRole.FACULTY,
      },
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  });
}

export async function createAnnouncement(
  actor: AuthUserContext,
  input: CreateAnnouncementInput,
  reqMeta?: RequestMeta
): Promise<AnnouncementDTO> {
  let targetCourseIds: string[];
  let primaryCourseId: string | null = null;
  let courseLabel = 'All Enrolled Courses';

  if (input.scope === AnnouncementScope.COURSE) {
    const courseId = input.courseId || '';
    if (!mongoose.isValidObjectId(courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
    if (!course) {
      throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
    }

    if (actor.role !== UserRole.ADMIN) {
      const allowed =
        actor.role === UserRole.FACULTY
          ? await isCourseFaculty(actor.id, courseId)
          : actor.role === UserRole.STUDENT
            ? await isAssignedCR(actor.id, courseId)
            : false;

      if (!allowed) {
        throw new AppError(
          403,
          'COURSE_SCOPE_FORBIDDEN',
          'You can only post announcements to courses you teach or represent as CR'
        );
      }
    }

    primaryCourseId = course._id.toString();
    targetCourseIds = [primaryCourseId];
    courseLabel = course.courseCode;
  } else {
    // ALL_ENROLLED scope
    if (actor.role === UserRole.ADMIN) {
      const courses = await CourseModel.find({
        deletedAt: null,
        status: CourseStatus.ACTIVE,
      })
        .select('_id')
        .lean();
      targetCourseIds = courses.map((c) => c._id.toString());
    } else if (actor.role === UserRole.FACULTY) {
      const taught = await CourseModel.find({
        facultyIds: new mongoose.Types.ObjectId(actor.id),
        deletedAt: null,
        status: CourseStatus.ACTIVE,
      })
        .select('_id')
        .lean();
      targetCourseIds = taught.map((c) => c._id.toString());
    } else if (actor.role === UserRole.STUDENT && actor.crCourseIds.length > 0) {
      targetCourseIds = [...actor.crCourseIds];
    } else {
      throw new AppError(
        403,
        'AUTH_FORBIDDEN',
        'You do not have permission to broadcast announcements'
      );
    }

    if (targetCourseIds.length === 0) {
      throw new AppError(
        400,
        'NO_TARGET_COURSES',
        'No active courses found for your broadcast scope'
      );
    }
  }

  const doc = await AnnouncementModel.create({
    title: sanitizePlainText(input.title),
    content: sanitizeRichText(input.content),
    scope: input.scope,
    courseId: primaryCourseId ? new mongoose.Types.ObjectId(primaryCourseId) : null,
    targetCourseIds: targetCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
    pinned: Boolean(input.pinned),
    status: AnnouncementStatus.PUBLISHED,
    authorId: new mongoose.Types.ObjectId(actor.id),
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'ANNOUNCEMENT_CREATED',
    targetType: 'ANNOUNCEMENT',
    targetId: doc._id.toString(),
    metadata: {
      scope: doc.scope,
      courseId: primaryCourseId,
      targetCourseCount: targetCourseIds.length,
      pinned: doc.pinned,
    },
    reqMeta,
  });

  await notifyCourseMembers({
    courseIds: targetCourseIds,
    excludeUserId: actor.id,
    type: NotificationType.ANNOUNCEMENT,
    title: `${courseLabel}: ${doc.title}`,
    message: `${actor.name} posted an announcement.`,
    link: primaryCourseId
      ? `/courses/${primaryCourseId}?tab=announcements`
      : '/student',
    primaryCourseId,
  });

  const [dto] = await hydrateAnnouncements([doc]);
  return dto;
}

export async function listAnnouncements(
  viewer: AuthUserContext,
  query: ListAnnouncementsQuery
): Promise<{ announcements: AnnouncementDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    const accessible = await getAccessibleCourseIds(viewer);
    if (viewer.role !== UserRole.ADMIN && !accessible.includes(query.courseId)) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have access to this course announcements'
      );
    }
    const courseObjId = new mongoose.Types.ObjectId(query.courseId);
    filter.$or = [{ courseId: courseObjId }, { targetCourseIds: courseObjId }];
  } else if (viewer.role !== UserRole.ADMIN) {
    const accessible = await getAccessibleCourseIds(viewer);
    const accessibleObjIds = accessible.map((id) => new mongoose.Types.ObjectId(id));
    filter.$or = [
      { courseId: { $in: accessibleObjIds } },
      { targetCourseIds: { $in: accessibleObjIds } },
      { authorId: new mongoose.Types.ObjectId(viewer.id) },
    ];
  }

  if (query.status) {
    filter.status = query.status;
  } else if (!query.includeWithdrawn) {
    filter.status = AnnouncementStatus.PUBLISHED;
  }

  if (query.pinned !== undefined) {
    filter.pinned = query.pinned;
  }

  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    const searchCond = { $or: [{ title: rx }, { content: rx }] };
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, searchCond];
      delete filter.$or;
    } else {
      filter.$or = searchCond.$or;
    }
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    AnnouncementModel.find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    AnnouncementModel.countDocuments(filter),
  ]);

  const announcements = await hydrateAnnouncements(docs);
  return {
    announcements,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

async function assertCanManageAnnouncement(
  actor: AuthUserContext,
  doc: IAnnouncement
): Promise<void> {
  if (actor.role === UserRole.ADMIN) return;

  if (doc.courseId) {
    const cid = doc.courseId.toString();
    if (actor.role === UserRole.FACULTY && (await isCourseFaculty(actor.id, cid))) {
      return;
    }
    if (actor.role === UserRole.STUDENT && (await isAssignedCR(actor.id, cid))) {
      return;
    }
    throw new AppError(
      403,
      'COURSE_SCOPE_FORBIDDEN',
      'You do not have permission to modify announcements for this course'
    );
  }

  // Broadcast announcement: only original author (or admin) can edit/withdraw
  if (doc.authorId.toString() !== actor.id) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'Only the author or an administrator can modify this broadcast announcement'
    );
  }
}

export async function updateAnnouncement(
  actor: AuthUserContext,
  announcementId: string,
  input: UpdateAnnouncementInput,
  reqMeta?: RequestMeta
): Promise<AnnouncementDTO> {
  if (!mongoose.isValidObjectId(announcementId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid announcement ID');
  }
  const doc = await AnnouncementModel.findOne({
    _id: announcementId,
    deletedAt: null,
  });
  if (!doc) {
    throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  }

  await assertCanManageAnnouncement(actor, doc);

  if (input.title !== undefined) {
    doc.title = sanitizePlainText(input.title);
  }
  if (input.content !== undefined) {
    doc.content = sanitizeRichText(input.content);
  }
  if (input.pinned !== undefined) {
    doc.pinned = input.pinned;
  }

  await doc.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'ANNOUNCEMENT_UPDATED',
    targetType: 'ANNOUNCEMENT',
    targetId: doc._id.toString(),
    metadata: { updatedFields: Object.keys(input) },
    reqMeta,
  });

  const [dto] = await hydrateAnnouncements([doc]);
  return dto;
}

export async function withdrawAnnouncement(
  actor: AuthUserContext,
  announcementId: string,
  reqMeta?: RequestMeta
): Promise<AnnouncementDTO> {
  if (!mongoose.isValidObjectId(announcementId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid announcement ID');
  }
  const doc = await AnnouncementModel.findOne({
    _id: announcementId,
    deletedAt: null,
  });
  if (!doc) {
    throw new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  }

  await assertCanManageAnnouncement(actor, doc);

  doc.status = AnnouncementStatus.WITHDRAWN;
  doc.pinned = false;
  await doc.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'ANNOUNCEMENT_WITHDRAWN',
    targetType: 'ANNOUNCEMENT',
    targetId: doc._id.toString(),
    metadata: { title: doc.title },
    reqMeta,
  });

  const [dto] = await hydrateAnnouncements([doc]);
  return dto;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
