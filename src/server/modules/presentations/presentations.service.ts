import mongoose from 'mongoose';
import {
  PresentationProgressModel,
  PresentationTopicModel,
  type IPresentationProgress,
  type IPresentationTopic,
} from './presentations.model.ts';
import { CourseModel } from '../courses/courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import {
  isAssignedCR,
  isCourseFaculty,
  isEnrolled,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import {
  notifyCourseMembers,
  notifySpecificUsers,
} from '../notifications/notifications.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import {
  NotificationType,
  PresentationAssigneeType,
  PresentationStatus,
  UserRole,
  type CourseUserSummary,
  type PaginationMeta,
  type PresentationTopicDTO,
} from '../../../shared/types.ts';
import type {
  CoordinatePresentationTopicInput,
  CreatePresentationTopicInput,
  ListPresentationTopicsQuery,
  UpdatePresentationProgressInput,
} from './presentations.validation.ts';

export async function hydrateTopics(
  topics: IPresentationTopic[],
  progressList?: IPresentationProgress[]
): Promise<PresentationTopicDTO[]> {
  if (topics.length === 0) return [];

  const topicIds = topics.map((t) => t._id);
  const userIds = new Set<string>();
  for (const t of topics) {
    userIds.add(t.createdBy.toString());
    if (t.assigneeUserId) userIds.add(t.assigneeUserId.toString());
  }

  const [users, progressDocs] = await Promise.all([
    UserModel.find({ _id: { $in: Array.from(userIds) } })
      .select('name email role studentId department')
      .lean(),
    progressList
      ? Promise.resolve(progressList)
      : PresentationProgressModel.find({ topicId: { $in: topicIds } }),
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

  const progressMap = new Map<string, IPresentationProgress>();
  for (const p of progressDocs) {
    progressMap.set(p.topicId.toString(), p);
  }

  return topics.map((t) => {
    const id = t._id.toString();
    const creator = userMap.get(t.createdBy.toString());
    const assignee = t.assigneeUserId
      ? userMap.get(t.assigneeUserId.toString()) ?? null
      : null;
    const progress = progressMap.get(id);

    return {
      id,
      courseId: t.courseId.toString(),
      title: t.title,
      description: t.description,
      dueDate: t.dueDate.toISOString(),
      assigneeType: t.assigneeType,
      assigneeUser: assignee,
      assigneeLabel: t.assigneeLabel ?? null,
      coordinationNotes: t.coordinationNotes || '',
      presentationSlot: t.presentationSlot || '',
      aiBrief: t.aiBrief
        ? {
            explanation: t.aiBrief.explanation,
            subtopics: [...(t.aiBrief.subtopics ?? [])],
            outline: (t.aiBrief.outline ?? []).map((item) => ({
              section: item.section,
              keyPoints: [...(item.keyPoints ?? [])],
            })),
            discussionPoints: [...(t.aiBrief.discussionPoints ?? [])],
            possibleQuestions: (t.aiBrief.possibleQuestions ?? []).map((q) => ({
              question: q.question,
              suggestedAnswer: q.suggestedAnswer,
            })),
            conclusion: t.aiBrief.conclusion,
            savedAt: t.aiBrief.savedAt?.toISOString(),
            savedByName: t.aiBrief.savedByName,
          }
        : null,
      progress: {
        status: progress?.status ?? PresentationStatus.ASSIGNED,
        facultyNotes: progress?.facultyNotes ?? '',
        updatedAt: (progress?.updatedAt ?? t.updatedAt).toISOString(),
      },
      createdBy: {
        id: t.createdBy.toString(),
        name: creator?.name || 'Faculty',
      },
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  });
}

export async function listCourseTopics(
  courseId: string,
  query: ListPresentationTopicsQuery
): Promise<{ topics: PresentationTopicDTO[]; meta: PaginationMeta }> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const courseObjId = new mongoose.Types.ObjectId(courseId);
  const filter: Record<string, unknown> = {
    courseId: courseObjId,
    deletedAt: null,
  };

  if (query.assigneeType) {
    filter.assigneeType = query.assigneeType;
  }

  if (query.status) {
    const matchingProgress = await PresentationProgressModel.find({
      courseId: courseObjId,
      status: query.status,
    })
      .select('topicId')
      .lean();
    filter._id = { $in: matchingProgress.map((p) => p.topicId) };
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    PresentationTopicModel.find(filter)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    PresentationTopicModel.countDocuments(filter),
  ]);

  const topics = await hydrateTopics(docs);
  return {
    topics,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function createPresentationTopic(
  actor: AuthUserContext,
  courseId: string,
  input: CreatePresentationTopicInput,
  reqMeta?: RequestMeta
): Promise<PresentationTopicDTO> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }
  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  let assigneeUserId: mongoose.Types.ObjectId | null = null;
  if (input.assigneeType === PresentationAssigneeType.STUDENT) {
    const studentId = input.assigneeUserId || '';
    if (!mongoose.isValidObjectId(studentId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid student ID');
    }
    const enrolled = await isEnrolled(studentId, courseId);
    if (!enrolled) {
      throw new AppError(
        400,
        'STUDENT_NOT_ENROLLED',
        'Assigned student must be actively enrolled in this course'
      );
    }
    assigneeUserId = new mongoose.Types.ObjectId(studentId);
  }

  const topic = await PresentationTopicModel.create({
    courseId: course._id,
    title: sanitizePlainText(input.title),
    description: sanitizePlainText(input.description),
    dueDate: new Date(input.dueDate),
    assigneeType: input.assigneeType,
    assigneeUserId,
    assigneeLabel: input.assigneeLabel
      ? sanitizePlainText(input.assigneeLabel)
      : null,
    coordinationNotes: '',
    presentationSlot: '',
    createdBy: new mongoose.Types.ObjectId(actor.id),
  });

  const progress = await PresentationProgressModel.create({
    topicId: topic._id,
    courseId: course._id,
    status: PresentationStatus.ASSIGNED,
    facultyNotes: '',
    updatedBy: new mongoose.Types.ObjectId(actor.id),
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'PRESENTATION_TOPIC_CREATED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      title: topic.title,
      assigneeType: topic.assigneeType,
    },
    reqMeta,
  });

  const link = `/courses/${course._id.toString()}?tab=topics`;
  if (
    topic.assigneeType === PresentationAssigneeType.STUDENT &&
    assigneeUserId
  ) {
    await notifySpecificUsers({
      userIds: [assigneeUserId.toString()],
      excludeUserId: actor.id,
      type: NotificationType.TOPIC,
      title: `Presentation assigned (${course.courseCode})`,
      message: `${actor.name} assigned you the topic "${topic.title}".`,
      link,
      courseId: course._id.toString(),
    });
  } else {
    await notifyCourseMembers({
      courseIds: [course._id.toString()],
      excludeUserId: actor.id,
      type: NotificationType.TOPIC,
      title: `New topic in ${course.courseCode}`,
      message: `${actor.name} posted presentation topic "${topic.title}".`,
      link,
      primaryCourseId: course._id.toString(),
    });
  }

  const [dto] = await hydrateTopics([topic], [progress]);
  return dto;
}

export async function coordinatePresentationTopic(
  actor: AuthUserContext,
  topicId: string,
  input: CoordinatePresentationTopicInput,
  reqMeta?: RequestMeta
): Promise<PresentationTopicDTO> {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid topic ID');
  }

  const topic = await PresentationTopicModel.findOne({
    _id: topicId,
    deletedAt: null,
  });
  if (!topic) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Presentation topic not found');
  }

  const courseId = topic.courseId.toString();
  if (actor.role !== UserRole.ADMIN) {
    const [cr, faculty] = await Promise.all([
      actor.role === UserRole.STUDENT
        ? isAssignedCR(actor.id, courseId)
        : Promise.resolve(false),
      actor.role === UserRole.FACULTY
        ? isCourseFaculty(actor.id, courseId)
        : Promise.resolve(false),
    ]);
    if (!cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'Only an assigned CR or course faculty can coordinate this topic'
      );
    }
  }

  topic.coordinationNotes = sanitizePlainText(input.coordinationNotes);
  topic.presentationSlot = sanitizePlainText(input.presentationSlot);
  await topic.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'PRESENTATION_TOPIC_COORDINATED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: {
      courseId,
      presentationSlot: topic.presentationSlot,
    },
    reqMeta,
  });

  const [dto] = await hydrateTopics([topic]);
  return dto;
}

export async function updatePresentationProgress(
  actor: AuthUserContext,
  topicId: string,
  input: UpdatePresentationProgressInput,
  reqMeta?: RequestMeta
): Promise<PresentationTopicDTO> {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid topic ID');
  }

  const topic = await PresentationTopicModel.findOne({
    _id: topicId,
    deletedAt: null,
  });
  if (!topic) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Presentation topic not found');
  }

  const courseId = topic.courseId.toString();
  if (actor.role !== UserRole.ADMIN) {
    const faculty =
      actor.role === UserRole.FACULTY
        ? await isCourseFaculty(actor.id, courseId)
        : false;
    if (!faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'Only course faculty or administrators can update presentation progress'
      );
    }
  }

  const progress = await PresentationProgressModel.findOneAndUpdate(
    { topicId: topic._id },
    {
      $set: {
        courseId: topic.courseId,
        status: input.status,
        facultyNotes: sanitizePlainText(input.facultyNotes),
        updatedBy: new mongoose.Types.ObjectId(actor.id),
      },
    },
    { upsert: true, new: true }
  );

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'PRESENTATION_PROGRESS_UPDATED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: {
      courseId,
      status: input.status,
    },
    reqMeta,
  });

  const [dto] = await hydrateTopics([topic], [progress]);
  return dto;
}

export async function deletePresentationTopic(
  actor: AuthUserContext,
  topicId: string,
  reqMeta?: RequestMeta
): Promise<void> {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid topic ID');
  }

  const topic = await PresentationTopicModel.findOne({
    _id: topicId,
    deletedAt: null,
  });
  if (!topic) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Presentation topic not found');
  }

  const courseId = topic.courseId.toString();
  if (actor.role !== UserRole.ADMIN) {
    const faculty =
      actor.role === UserRole.FACULTY
        ? await isCourseFaculty(actor.id, courseId)
        : false;
    if (!faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'Only course faculty or administrators can remove presentation topics'
      );
    }
  }

  topic.deletedAt = new Date();
  await topic.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'PRESENTATION_TOPIC_DELETED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: { courseId, title: topic.title },
    reqMeta,
  });
}
