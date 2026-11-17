import mongoose from 'mongoose';
import { AI_CONFIG } from '../../config/env.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { CourseModel, type ICourse } from '../courses/courses.model.ts';
import {
  isAssignedCR,
  isCourseFaculty,
  isEnrolled,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import { notifySpecificUsers } from '../notifications/notifications.service.ts';
import { PresentationTopicModel } from '../presentations/presentations.model.ts';
import { hydrateTopics } from '../presentations/presentations.service.ts';
import { QuizQuestionModel } from '../quizzes/quizzes.model.ts';
import { hydratePublicQuestions } from '../quizzes/quizzes.service.ts';
import { normalizeQuestionText } from '../quizzes/textSimilarity.ts';
import { ResourceModel, type IResource } from '../resources/resources.model.ts';
import {
  AiConversationModel,
  AiUsageLogModel,
  DocumentChunkModel,
  type IAiConversation,
} from './ai.model.ts';
import {
  assertGeminiConfigured,
  cosineSimilarity,
  embedDocumentTexts,
  generatePresentationBriefJson,
  generateQuizQuestionsJson,
  streamStudyAnswer,
  summarizeNoteContent,
  type StudyChunkContext,
  type StudyHistoryTurn,
} from './gemini.service.ts';
import {
  NotificationType,
  PresentationAssigneeType,
  QuizQuestionSource,
  QuizQuestionStatus,
  ResourceStatus,
  ResourceVisibility,
  UserRole,
  type AiCitationDTO,
  type AiConversationDTO,
  type AiQuotaStatusDTO,
  type GeneratedAiQuizResponseDTO,
  type NoteSummaryResponseDTO,
  type PresentationAssistResponseDTO,
  type PresentationTopicDTO,
} from '../../../shared/types.ts';
import type {
  GenerateAiQuizInput,
  ListConversationsQuery,
  PresentationAssistInput,
  SavePresentationBriefInput,
  StudyAskInput,
  StudySummarizeInput,
} from './ai.validation.ts';

const MIN_CHUNK_SIMILARITY = 0.25;
const MAX_RETRIEVED_CHUNKS = 6;
const MAX_SUMMARY_CHUNKS = 14;

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextUtcResetIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  return next.toISOString();
}

export async function getQuotaStatus(userId: string): Promise<AiQuotaStatusDTO> {
  const dateKey = getUtcDateKey();
  const log = await AiUsageLogModel.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    dateKey,
  }).lean();
  const usedToday = log?.count ?? 0;
  const dailyLimit = AI_CONFIG.dailyQuotaPerUser;
  return {
    usedToday,
    dailyLimit,
    remaining: Math.max(0, dailyLimit - usedToday),
    resetsAt: getNextUtcResetIso(),
  };
}

export async function assertAndConsumeDailyQuota(
  userId: string,
  actionLabel: string
): Promise<AiQuotaStatusDTO> {
  const dateKey = getUtcDateKey();
  const dailyLimit = AI_CONFIG.dailyQuotaPerUser;
  const userObjId = new mongoose.Types.ObjectId(userId);

  // Atomically increment only if current count is strictly below dailyLimit (or doc doesn't exist yet)
  const updated = await AiUsageLogModel.findOneAndUpdate(
    {
      userId: userObjId,
      dateKey,
      count: { $lt: dailyLimit },
    },
    {
      $inc: { count: 1 },
      $set: { lastAction: actionLabel },
    },
    { new: true }
  );

  if (updated) {
    return {
      usedToday: updated.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - updated.count),
      resetsAt: getNextUtcResetIso(),
    };
  }

  // Either doc doesn't exist yet or limit is already reached
  const existing = await AiUsageLogModel.findOne({
    userId: userObjId,
    dateKey,
  }).lean();

  if (existing && existing.count >= dailyLimit) {
    throw new AppError(
      429,
      'AI_DAILY_QUOTA_EXCEEDED',
      `Daily AI quota of ${dailyLimit} requests reached. Quota resets at 00:00 UTC.`,
      {
        usedToday: existing.count,
        dailyLimit,
        resetsAt: getNextUtcResetIso(),
      }
    );
  }

  try {
    const created = await AiUsageLogModel.create({
      userId: userObjId,
      dateKey,
      count: 1,
      lastAction: actionLabel,
    });
    return {
      usedToday: created.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - created.count),
      resetsAt: getNextUtcResetIso(),
    };
  } catch {
    // Handle concurrent first-request race
    const retried = await AiUsageLogModel.findOneAndUpdate(
      { userId: userObjId, dateKey, count: { $lt: dailyLimit } },
      { $inc: { count: 1 }, $set: { lastAction: actionLabel } },
      { new: true }
    );
    if (!retried) {
      throw new AppError(
        429,
        'AI_DAILY_QUOTA_EXCEEDED',
        `Daily AI quota of ${dailyLimit} requests reached.`
      );
    }
    return {
      usedToday: retried.count,
      dailyLimit,
      remaining: Math.max(0, dailyLimit - retried.count),
      resetsAt: getNextUtcResetIso(),
    };
  }
}

async function assertStudyCourseAccess(
  actor: AuthUserContext,
  courseId: string,
  resourceId?: string | null
): Promise<{
  course: ICourse;
  canReadPrivate: boolean;
  resource: IResource | null;
}> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  let canReadPrivate = actor.role === UserRole.ADMIN;
  if (actor.role !== UserRole.ADMIN) {
    const [enrolled, cr, faculty] = await Promise.all([
      isEnrolled(actor.id, courseId),
      actor.role === UserRole.STUDENT
        ? isAssignedCR(actor.id, courseId)
        : Promise.resolve(false),
      actor.role === UserRole.FACULTY
        ? isCourseFaculty(actor.id, courseId)
        : Promise.resolve(false),
    ]);

    if (!enrolled && !cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You can only use the Study Assistant on courses you belong to'
      );
    }
    canReadPrivate = cr || faculty;
  }

  let resource: IResource | null = null;
  if (resourceId) {
    if (!mongoose.isValidObjectId(resourceId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid resource ID');
    }
    resource = await ResourceModel.findOne({
      _id: resourceId,
      courseId: course._id,
      deletedAt: null,
    });
    if (!resource) {
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Course resource not found');
    }
    if (resource.visibility === ResourceVisibility.PRIVATE && !canReadPrivate) {
      throw new AppError(
        403,
        'RESOURCE_PRIVATE_FORBIDDEN',
        'This private resource is restricted to course faculty and assigned CRs'
      );
    }
    if (resource.status !== ResourceStatus.READY) {
      throw new AppError(
        409,
        'RESOURCE_NOT_READY',
        'This resource is still processing or failed ingestion and cannot be queried yet'
      );
    }
  }

  return { course, canReadPrivate, resource };
}

async function hydrateConversations(
  docs: IAiConversation[]
): Promise<AiConversationDTO[]> {
  if (docs.length === 0) return [];
  const courseIds = Array.from(new Set(docs.map((d) => d.courseId.toString())));
  const courses = await CourseModel.find({ _id: { $in: courseIds } })
    .select('courseCode courseName')
    .lean();
  const courseMap = new Map(
    courses.map((c) => [
      c._id.toString(),
      { courseCode: c.courseCode, courseName: c.courseName },
    ])
  );

  return docs.map((d) => {
    const c = courseMap.get(d.courseId.toString());
    return {
      id: d._id.toString(),
      courseId: d.courseId.toString(),
      courseCode: c?.courseCode || 'Course',
      courseName: c?.courseName || '',
      resourceId: d.resourceId ? d.resourceId.toString() : null,
      title: d.title,
      messages: (d.messages ?? []).map((m) => ({
        id: m._id ? m._id.toString() : new mongoose.Types.ObjectId().toString(),
        role: m.role,
        content: m.content,
        citations: m.citations ?? [],
        insufficientEvidence: Boolean(m.insufficientEvidence),
        createdAt: (m.createdAt ?? d.updatedAt).toISOString(),
      })),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  });
}

export async function listUserConversations(
  actor: AuthUserContext,
  query: ListConversationsQuery
): Promise<AiConversationDTO[]> {
  const filter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(actor.id),
  };
  if (query.courseId) {
    filter.courseId = new mongoose.Types.ObjectId(query.courseId);
  }
  const docs = await AiConversationModel.find(filter)
    .sort({ updatedAt: -1 })
    .limit(query.limit);
  return hydrateConversations(docs);
}

export async function getConversationById(
  actor: AuthUserContext,
  conversationId: string
): Promise<AiConversationDTO> {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid conversation ID');
  }
  const doc = await AiConversationModel.findById(conversationId);
  if (!doc) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  if (doc.userId.toString() !== actor.id && actor.role !== UserRole.ADMIN) {
    throw new AppError(403, 'AUTH_FORBIDDEN', 'You can only view your own conversations');
  }
  const [dto] = await hydrateConversations([doc]);
  return dto;
}

export async function deleteConversation(
  actor: AuthUserContext,
  conversationId: string
): Promise<void> {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid conversation ID');
  }
  const doc = await AiConversationModel.findById(conversationId);
  if (!doc) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  if (doc.userId.toString() !== actor.id && actor.role !== UserRole.ADMIN) {
    throw new AppError(403, 'AUTH_FORBIDDEN', 'You can only delete your own conversations');
  }
  await doc.deleteOne();
}

export interface PreparedStudyContext {
  course: ICourse;
  conversation: IAiConversation | null;
  priorHistory: StudyHistoryTurn[];
  citations: AiCitationDTO[];
  chunksForPrompt: StudyChunkContext[];
  insufficientEvidence: boolean;
  insufficientMessage: string;
}

export async function prepareStudyAsk(
  actor: AuthUserContext,
  input: StudyAskInput
): Promise<PreparedStudyContext> {
  const { course, canReadPrivate, resource } = await assertStudyCourseAccess(
    actor,
    input.courseId,
    input.resourceId || null
  );

  let conversation: IAiConversation | null = null;
  if (input.conversationId) {
    conversation = await AiConversationModel.findById(input.conversationId);
    if (!conversation) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }
    if (conversation.userId.toString() !== actor.id) {
      throw new AppError(
        403,
        'AUTH_FORBIDDEN',
        'You cannot post into another user’s conversation'
      );
    }
  }

  const priorHistory: StudyHistoryTurn[] = conversation
    ? conversation.messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }))
    : [];

  // Restrict retrieval strictly to READY, non-deleted resources within accessible visibility
  const resourceFilter: Record<string, unknown> = {
    courseId: course._id,
    status: ResourceStatus.READY,
    deletedAt: null,
  };
  if (resource) {
    resourceFilter._id = resource._id;
  }
  if (!canReadPrivate) {
    resourceFilter.visibility = ResourceVisibility.COURSE;
  }

  const eligibleResources = await ResourceModel.find(resourceFilter)
    .select('_id')
    .lean();

  if (eligibleResources.length === 0) {
    return {
      course,
      conversation,
      priorHistory,
      citations: [],
      chunksForPrompt: [],
      insufficientEvidence: true,
      insufficientMessage:
        'The selected course has no indexed PDF notes yet, so there is not enough information in the course notes to answer this question.',
    };
  }

  const chunkFilter: Record<string, unknown> = {
    courseId: course._id,
    resourceId: { $in: eligibleResources.map((r) => r._id) },
  };
  if (!canReadPrivate) {
    chunkFilter.visibility = ResourceVisibility.COURSE;
  }

  const candidateChunks = await DocumentChunkModel.find(chunkFilter)
    .limit(400)
    .lean();

  if (candidateChunks.length === 0) {
    return {
      course,
      conversation,
      priorHistory,
      citations: [],
      chunksForPrompt: [],
      insufficientEvidence: true,
      insufficientMessage:
        'The uploaded course notes do not have searchable text chunks yet, so there is not enough information in the notes to answer this question.',
    };
  }

  // Ensure Gemini is configured and consume daily quota before embedding/streaming
  assertGeminiConfigured();
  const [queryVec] = await embedDocumentTexts([input.question]);

  const scored = candidateChunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVec, chunk.embedding ?? []),
    }))
    .sort((a, b) => b.score - a.score);

  const relevant = scored
    .filter((item) => item.score >= MIN_CHUNK_SIMILARITY)
    .slice(0, MAX_RETRIEVED_CHUNKS);

  if (relevant.length === 0) {
    return {
      course,
      conversation,
      priorHistory,
      citations: [],
      chunksForPrompt: [],
      insufficientEvidence: true,
      insufficientMessage:
        'The selected course notes do not contain enough relevant information to answer this question reliably. Try rephrasing or selecting another note.',
    };
  }

  const citations: AiCitationDTO[] = relevant.map(({ chunk, score }) => ({
    resourceId: chunk.resourceId.toString(),
    fileName: chunk.fileName,
    resourceTitle: chunk.resourceTitle,
    pageNumber: chunk.pageNumber,
    excerpt: chunk.content.slice(0, 220) + (chunk.content.length > 220 ? '...' : ''),
    score: Number(score.toFixed(3)),
  }));

  const chunksForPrompt: StudyChunkContext[] = relevant.map(({ chunk }) => ({
    fileName: chunk.fileName,
    resourceTitle: chunk.resourceTitle,
    pageNumber: chunk.pageNumber,
    content: chunk.content,
  }));

  return {
    course,
    conversation,
    priorHistory,
    citations,
    chunksForPrompt,
    insufficientEvidence: false,
    insufficientMessage: '',
  };
}

export async function persistStudyTurn(params: {
  actor: AuthUserContext;
  courseId: mongoose.Types.ObjectId;
  resourceId?: string | null;
  conversation: IAiConversation | null;
  question: string;
  answer: string;
  citations: AiCitationDTO[];
  insufficientEvidence: boolean;
}): Promise<AiConversationDTO> {
  const cleanQuestion = sanitizePlainText(params.question);
  const now = new Date();

  let doc = params.conversation;
  if (!doc) {
    doc = await AiConversationModel.create({
      userId: new mongoose.Types.ObjectId(params.actor.id),
      courseId: params.courseId,
      resourceId:
        params.resourceId && mongoose.isValidObjectId(params.resourceId)
          ? new mongoose.Types.ObjectId(params.resourceId)
          : null,
      title: cleanQuestion.slice(0, 90) || 'Study Session',
      messages: [],
    });
  }

  doc.messages.push(
    {
      _id: new mongoose.Types.ObjectId(),
      role: 'user',
      content: cleanQuestion,
      citations: [],
      insufficientEvidence: false,
      createdAt: now,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      role: 'assistant',
      content: params.answer,
      citations: params.citations,
      insufficientEvidence: params.insufficientEvidence,
      createdAt: new Date(),
    }
  );
  await doc.save();

  const [dto] = await hydrateConversations([doc]);
  return dto;
}

export async function executeStudyStream(
  actor: AuthUserContext,
  prepared: PreparedStudyContext,
  input: StudyAskInput,
  callbacks: {
    onDelta: (delta: string) => void;
  },
  reqMeta?: RequestMeta
): Promise<{
  conversation: AiConversationDTO;
  quota: AiQuotaStatusDTO;
}> {
  if (prepared.insufficientEvidence) {
    callbacks.onDelta(prepared.insufficientMessage);
    const conversation = await persistStudyTurn({
      actor,
      courseId: prepared.course._id as mongoose.Types.ObjectId,
      resourceId: input.resourceId || null,
      conversation: prepared.conversation,
      question: input.question,
      answer: prepared.insufficientMessage,
      citations: prepared.citations,
      insufficientEvidence: true,
    });
    const quota = await getQuotaStatus(actor.id);
    return { conversation, quota };
  }

  const quota = await assertAndConsumeDailyQuota(actor.id, 'STUDY_ASK');
  let fullAnswer = '';

  for await (const delta of streamStudyAnswer({
    courseCode: prepared.course.courseCode,
    courseName: prepared.course.courseName,
    question: input.question,
    chunks: prepared.chunksForPrompt,
    history: prepared.priorHistory,
  })) {
    fullAnswer += delta;
    callbacks.onDelta(delta);
  }

  if (!fullAnswer.trim()) {
    fullAnswer =
      'The selected course notes do not contain enough information to answer this question.';
    callbacks.onDelta(fullAnswer);
  }

  const lower = fullAnswer.toLowerCase();
  const modelFlaggedInsufficient =
    lower.includes('do not contain enough information') ||
    lower.includes('not enough information in the');

  const conversation = await persistStudyTurn({
    actor,
    courseId: prepared.course._id as mongoose.Types.ObjectId,
    resourceId: input.resourceId || null,
    conversation: prepared.conversation,
    question: input.question,
    answer: fullAnswer.trim(),
    citations: prepared.citations,
    insufficientEvidence: modelFlaggedInsufficient,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'AI_STUDY_QUESTION_ANSWERED',
    targetType: 'AI_CONVERSATION',
    targetId: conversation.id,
    metadata: {
      courseCode: prepared.course.courseCode,
      citationCount: prepared.citations.length,
    },
    reqMeta,
  });

  return { conversation, quota };
}

async function loadChunksForResource(
  resource: IResource,
  maxChunks = MAX_SUMMARY_CHUNKS
): Promise<{
  chunksForPrompt: StudyChunkContext[];
  citations: AiCitationDTO[];
}> {
  const chunks = await DocumentChunkModel.find({ resourceId: resource._id })
    .sort({ chunkIndex: 1 })
    .limit(maxChunks)
    .lean();

  if (chunks.length > 0) {
    return {
      chunksForPrompt: chunks.map((c) => ({
        fileName: c.fileName,
        resourceTitle: c.resourceTitle,
        pageNumber: c.pageNumber,
        content: c.content,
      })),
      citations: chunks.slice(0, 6).map((c) => ({
        resourceId: resource._id.toString(),
        fileName: c.fileName,
        resourceTitle: c.resourceTitle,
        pageNumber: c.pageNumber,
        excerpt: c.content.slice(0, 200) + (c.content.length > 200 ? '...' : ''),
        score: 1,
      })),
    };
  }

  // Fallback to stored extractedText on resource if chunk list is empty
  const fullRes = await ResourceModel.findById(resource._id)
    .select('+extractedText')
    .lean();
  const extracted = (fullRes?.extractedText || '').trim();
  if (!extracted) {
    throw new AppError(
      422,
      'RESOURCE_NO_TEXT',
      'This resource has no indexed text chunks available for AI processing.'
    );
  }

  const trimmed = extracted.slice(0, 12_000);
  return {
    chunksForPrompt: [
      {
        fileName: resource.file.originalName,
        resourceTitle: resource.title,
        pageNumber: 1,
        content: trimmed,
      },
    ],
    citations: [
      {
        resourceId: resource._id.toString(),
        fileName: resource.file.originalName,
        resourceTitle: resource.title,
        pageNumber: 1,
        excerpt: trimmed.slice(0, 200),
        score: 1,
      },
    ],
  };
}

export async function summarizeCourseNote(
  actor: AuthUserContext,
  input: StudySummarizeInput,
  reqMeta?: RequestMeta
): Promise<NoteSummaryResponseDTO> {
  const { course, resource } = await assertStudyCourseAccess(
    actor,
    input.courseId,
    input.resourceId
  );
  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Course resource not found');
  }

  const { chunksForPrompt, citations } = await loadChunksForResource(
    resource,
    MAX_SUMMARY_CHUNKS
  );

  assertGeminiConfigured();
  const quota = await assertAndConsumeDailyQuota(actor.id, 'STUDY_SUMMARIZE');

  const result = await summarizeNoteContent({
    courseCode: course.courseCode,
    resourceTitle: resource.title,
    fileName: resource.file.originalName,
    chunks: chunksForPrompt,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'AI_NOTE_SUMMARIZED',
    targetType: 'RESOURCE',
    targetId: resource._id.toString(),
    metadata: { courseCode: course.courseCode, title: resource.title },
    reqMeta,
  });

  return {
    resourceId: resource._id.toString(),
    resourceTitle: resource.title,
    fileName: resource.file.originalName,
    summary: result.summary,
    keyTakeaways: result.keyTakeaways,
    citations,
    aiGenerated: true,
    quota,
  };
}

export async function generateAiQuizFromNote(
  actor: AuthUserContext,
  input: GenerateAiQuizInput,
  reqMeta?: RequestMeta
): Promise<GeneratedAiQuizResponseDTO> {
  const { course, resource } = await assertStudyCourseAccess(
    actor,
    input.courseId,
    input.resourceId
  );
  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Course resource not found');
  }

  const { chunksForPrompt } = await loadChunksForResource(resource, 10);

  assertGeminiConfigured();
  const quota = await assertAndConsumeDailyQuota(actor.id, 'QUIZ_GENERATE');

  const drafts = await generateQuizQuestionsJson({
    courseCode: course.courseCode,
    courseName: course.courseName,
    resourceTitle: resource.title,
    fileName: resource.file.originalName,
    count: input.count,
    difficulty: input.difficulty,
    topic: input.topic,
    chunks: chunksForPrompt,
  });

  const createdDocs = await QuizQuestionModel.insertMany(
    drafts.map((d) => {
      const cleanText = sanitizePlainText(d.questionText);
      const cleanOptions =
        d.type === 'TRUE_FALSE'
          ? ['True', 'False']
          : d.type === 'MCQ'
            ? d.options.map((o) => sanitizePlainText(o)).filter(Boolean)
            : [];
      let cleanCorrect = sanitizePlainText(d.correctAnswer);
      if (d.type === 'MCQ') {
        const matched = cleanOptions.find(
          (o) => o.toLowerCase() === cleanCorrect.toLowerCase()
        );
        if (matched) cleanCorrect = matched;
      } else if (d.type === 'TRUE_FALSE') {
        cleanCorrect = cleanCorrect.toLowerCase() === 'true' ? 'True' : 'False';
      }

      return {
        courseId: course._id,
        contributorId: new mongoose.Types.ObjectId(actor.id),
        topic: sanitizePlainText(d.topic),
        difficulty: d.difficulty,
        type: d.type,
        source: QuizQuestionSource.AI,
        sourceResourceId: resource._id,
        questionText: cleanText,
        normalizedText: normalizeQuestionText(cleanText),
        options: cleanOptions,
        correctAnswer: cleanCorrect,
        explanation: sanitizePlainText(d.explanation),
        status: QuizQuestionStatus.PENDING,
        potentialDuplicates: [],
      };
    })
  );

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'AI_QUIZ_QUESTIONS_GENERATED',
    targetType: 'RESOURCE',
    targetId: resource._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      generatedCount: createdDocs.length,
      status: QuizQuestionStatus.PENDING,
      source: QuizQuestionSource.AI,
    },
    reqMeta,
  });

  const facultyIds = course.facultyIds.map((f) => f.toString());
  if (facultyIds.length > 0) {
    await notifySpecificUsers({
      userIds: facultyIds,
      excludeUserId: actor.id,
      type: NotificationType.QUIZ,
      title: `${createdDocs.length} AI quiz question(s) queued (${course.courseCode})`,
      message: `${actor.name} generated ${createdDocs.length} AI question(s) from "${resource.title}" awaiting faculty review.`,
      link: `/quizzes?tab=review&courseId=${course._id.toString()}`,
      courseId: course._id.toString(),
    });
  }

  // Strictly return public DTOs (no correctAnswer/explanation exposed before submission)
  const publicQuestions = await hydratePublicQuestions(createdDocs);

  return {
    resourceId: resource._id.toString(),
    resourceTitle: resource.title,
    generatedCount: publicQuestions.length,
    questions: publicQuestions,
    aiGenerated: true,
    quota,
  };
}

async function assertPresentationAssistantScope(
  actor: AuthUserContext,
  topicId: string
) {
  if (!mongoose.isValidObjectId(topicId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid presentation topic ID');
  }

  const topic = await PresentationTopicModel.findOne({
    _id: topicId,
    deletedAt: null,
  });
  if (!topic) {
    throw new AppError(404, 'TOPIC_NOT_FOUND', 'Presentation topic not found');
  }

  const courseId = topic.courseId.toString();
  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

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
        'Presentation Assistant is restricted to assigned CRs and faculty of this course'
      );
    }
  }

  return { topic, course };
}

export async function generatePresentationAssistantBrief(
  actor: AuthUserContext,
  input: PresentationAssistInput,
  reqMeta?: RequestMeta
): Promise<PresentationAssistResponseDTO> {
  const { topic, course } = await assertPresentationAssistantScope(
    actor,
    input.topicId
  );

  // Pull up to 4 relevant chunks from course materials as optional reference context
  const courseChunks = await DocumentChunkModel.find({
    courseId: course._id,
  })
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  const courseExcerpts: StudyChunkContext[] = courseChunks.map((c) => ({
    fileName: c.fileName,
    resourceTitle: c.resourceTitle,
    pageNumber: c.pageNumber,
    content: c.content.slice(0, 1200),
  }));

  const assigneeSummary =
    topic.assigneeType === PresentationAssigneeType.TEAM
      ? `Team: ${topic.assigneeLabel || 'Project Team'}`
      : topic.assigneeType === PresentationAssigneeType.STUDENT
        ? 'Individual Student Presenter'
        : 'Entire Course';

  assertGeminiConfigured();
  const quota = await assertAndConsumeDailyQuota(actor.id, 'PRESENTATION_ASSIST');

  const brief = await generatePresentationBriefJson({
    courseCode: course.courseCode,
    courseName: course.courseName,
    topicTitle: topic.title,
    topicDescription: topic.description,
    assigneeSummary,
    focusNotes: input.focusNotes,
    courseExcerpts,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'AI_PRESENTATION_ASSISTED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: { courseCode: course.courseCode, title: topic.title },
    reqMeta,
  });

  return {
    topicId: topic._id.toString(),
    topicTitle: topic.title,
    courseId: course._id.toString(),
    courseCode: course.courseCode,
    brief,
    aiGenerated: true,
    quota,
  };
}

export async function savePresentationBriefToTopic(
  actor: AuthUserContext,
  topicId: string,
  input: SavePresentationBriefInput,
  reqMeta?: RequestMeta
): Promise<PresentationTopicDTO> {
  const { topic, course } = await assertPresentationAssistantScope(
    actor,
    topicId
  );

  topic.aiBrief = {
    explanation: sanitizePlainText(input.explanation),
    subtopics: input.subtopics.map((s) => sanitizePlainText(s)).filter(Boolean),
    outline: input.outline.map((item) => ({
      section: sanitizePlainText(item.section),
      keyPoints: item.keyPoints.map((kp) => sanitizePlainText(kp)).filter(Boolean),
    })),
    discussionPoints: input.discussionPoints
      .map((p) => sanitizePlainText(p))
      .filter(Boolean),
    possibleQuestions: input.possibleQuestions.map((q) => ({
      question: sanitizePlainText(q.question),
      suggestedAnswer: sanitizePlainText(q.suggestedAnswer),
    })),
    conclusion: sanitizePlainText(input.conclusion),
    savedAt: new Date(),
    savedBy: new mongoose.Types.ObjectId(actor.id),
    savedByName: actor.name,
  };
  await topic.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'PRESENTATION_AI_BRIEF_SAVED',
    targetType: 'PRESENTATION_TOPIC',
    targetId: topic._id.toString(),
    metadata: { courseCode: course.courseCode, title: topic.title },
    reqMeta,
  });

  const [dto] = await hydrateTopics([topic]);
  return dto;
}
