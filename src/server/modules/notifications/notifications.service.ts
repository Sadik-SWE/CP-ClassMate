import mongoose from 'mongoose';
import { NotificationModel } from './notifications.model.ts';
import {
  CourseEnrollmentModel,
  CourseModel,
} from '../courses/courses.model.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import { logger } from '../../utils/logger.ts';
import {
  EnrollmentStatus,
  NotificationType,
  type NotificationDTO,
  type PaginationMeta,
} from '../../../shared/types.ts';
import type { ListNotificationsQuery } from './notifications.validation.ts';

export async function notifyCourseMembers(params: {
  courseIds: string[];
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  primaryCourseId?: string | null;
}): Promise<void> {
  try {
    const validCourseIds = params.courseIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (validCourseIds.length === 0) return;

    const [courses, enrollments] = await Promise.all([
      CourseModel.find({ _id: { $in: validCourseIds }, deletedAt: null })
        .select('facultyIds crUserIds')
        .lean(),
      CourseEnrollmentModel.find({
        courseId: { $in: validCourseIds },
        status: EnrollmentStatus.ACTIVE,
      })
        .select('userId')
        .lean(),
    ]);

    const recipientSet = new Set<string>();
    for (const c of courses) {
      for (const fid of c.facultyIds) recipientSet.add(fid.toString());
      for (const cid of c.crUserIds) recipientSet.add(cid.toString());
    }
    for (const e of enrollments) {
      recipientSet.add(e.userId.toString());
    }
    if (params.excludeUserId) {
      recipientSet.delete(params.excludeUserId);
    }

    if (recipientSet.size === 0) return;

    const cleanTitle = sanitizePlainText(params.title).slice(0, 180);
    const cleanMessage = sanitizePlainText(params.message).slice(0, 400);
    const primaryCid =
      params.primaryCourseId && mongoose.isValidObjectId(params.primaryCourseId)
        ? new mongoose.Types.ObjectId(params.primaryCourseId)
        : validCourseIds[0];

    const docs = Array.from(recipientSet).map((uid) => ({
      userId: new mongoose.Types.ObjectId(uid),
      type: params.type,
      title: cleanTitle,
      message: cleanMessage,
      courseId: primaryCid,
      link: params.link,
      readAt: null,
    }));

    await NotificationModel.insertMany(docs, { ordered: false });
  } catch (err) {
    logger.warn({ err, type: params.type }, 'Failed to dispatch notifications');
  }
}

export async function notifySpecificUsers(params: {
  userIds: string[];
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
  courseId?: string | null;
}): Promise<void> {
  try {
    const unique = new Set(
      params.userIds.filter((id) => mongoose.isValidObjectId(id))
    );
    if (params.excludeUserId) unique.delete(params.excludeUserId);
    if (unique.size === 0) return;

    const cleanTitle = sanitizePlainText(params.title).slice(0, 180);
    const cleanMessage = sanitizePlainText(params.message).slice(0, 400);
    const courseObjId =
      params.courseId && mongoose.isValidObjectId(params.courseId)
        ? new mongoose.Types.ObjectId(params.courseId)
        : null;

    await NotificationModel.insertMany(
      Array.from(unique).map((uid) => ({
        userId: new mongoose.Types.ObjectId(uid),
        type: params.type,
        title: cleanTitle,
        message: cleanMessage,
        courseId: courseObjId,
        link: params.link,
        readAt: null,
      })),
      { ordered: false }
    );
  } catch (err) {
    logger.warn({ err, type: params.type }, 'Failed to dispatch user notifications');
  }
}

export async function listMyNotifications(
  userId: string,
  query: ListNotificationsQuery
): Promise<{
  notifications: NotificationDTO[];
  unreadCount: number;
  meta: PaginationMeta;
}> {
  const userObjId = new mongoose.Types.ObjectId(userId);
  const filter: Record<string, unknown> = { userId: userObjId };
  if (query.unreadOnly) {
    filter.readAt = null;
  }

  const skip = (query.page - 1) * query.limit;

  const [docs, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId: userObjId, readAt: null }),
  ]);

  const notifications: NotificationDTO[] = docs.map((d) => ({
    id: d._id.toString(),
    type: d.type,
    title: d.title,
    message: d.message,
    courseId: d.courseId ? d.courseId.toString() : null,
    link: d.link,
    readAt: d.readAt ? new Date(d.readAt).toISOString() : null,
    createdAt: new Date(d.createdAt).toISOString(),
  }));

  return {
    notifications,
    unreadCount,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<NotificationDTO> {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid notification ID');
  }

  const doc = await NotificationModel.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(notificationId),
      userId: new mongoose.Types.ObjectId(userId),
    },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();

  if (!doc) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  }

  return {
    id: doc._id.toString(),
    type: doc.type,
    title: doc.title,
    message: doc.message,
    courseId: doc.courseId ? doc.courseId.toString() : null,
    link: doc.link,
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await NotificationModel.updateMany(
    { userId: new mongoose.Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } }
  );
  return result.modifiedCount;
}
