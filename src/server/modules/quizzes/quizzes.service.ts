import mongoose from 'mongoose';
import { CourseModel } from '../courses/courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import {
  getAccessibleCourseIds,
  isAssignedCR,
  isCourseFaculty,
  isEnrolled,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import {
  ContributionModel,
  QuestionReportModel,
  QuizAttemptModel,
  QuizQuestionModel,
  type IQuizAttempt,
  type IQuizQuestion,
} from './quizzes.model.ts';
import { computeTextSimilarity, normalizeQuestionText } from './textSimilarity.ts';
import { notifySpecificUsers } from '../notifications/notifications.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import {
  NotificationType,
  QuestionReportStatus,
  QuizAttemptStatus,
  QuizDifficulty,
  QuizQuestionSource,
  QuizQuestionStatus,
  QuizQuestionType,
  TopicMasteryStatus,
  UserRole,
  type ContributionLedgerDTO,
  type LeaderboardEntryDTO,
  type PaginationMeta,
  type QuestionReportSummaryDTO,
  type QuizAttemptDTO,
  type QuizAttemptReviewItem,
  type QuizPracticeQuestionDTO,
  type QuizQuestionPublicDTO,
  type QuizQuestionReviewDTO,
  type SimilarQuestionMatch,
  type TopicWeaknessSummary,
} from '../../../shared/types.ts';
import type {
  ContributeQuestionInput,
  LeaderboardQuery,
  ListAttemptsQuery,
  ListQuizBankQuery,
  ListReviewQueueQuery,
  ReportQuestionInput,
  ResolveReportsInput,
  ReviewQuestionInput,
  StartPracticeInput,
  SubmitPracticeInput,
} from './quizzes.validation.ts';

export const QUIZ_POINTS_BY_DIFFICULTY: Record<QuizDifficulty, number> = {
  EASY: 10,
  MEDIUM: 15,
  HARD: 25,
};

const DUPLICATE_SIMILARITY_WARN = 0.55;
const DUPLICATE_SIMILARITY_BLOCK = 0.9;

async function ensureCourseMemberAccess(
  actor: AuthUserContext,
  courseId: string,
  actionDescription: string
): Promise<void> {
  if (actor.role === UserRole.ADMIN) return;
  const [enrolled, cr, faculty] = await Promise.all([
    isEnrolled(actor.id, courseId),
    isAssignedCR(actor.id, courseId),
    isCourseFaculty(actor.id, courseId),
  ]);
  if (!enrolled && !cr && !faculty) {
    throw new AppError(
      403,
      'COURSE_SCOPE_FORBIDDEN',
      `You must belong to this course to ${actionDescription}`
    );
  }
}

async function ensureFacultyOrAdminCourseScope(
  actor: AuthUserContext,
  courseId: string
): Promise<void> {
  if (actor.role === UserRole.ADMIN) return;
  if (actor.role !== UserRole.FACULTY) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'Only course faculty or administrators can review quiz questions'
    );
  }
  const teaches = await isCourseFaculty(actor.id, courseId);
  if (!teaches) {
    throw new AppError(
      403,
      'COURSE_SCOPE_FORBIDDEN',
      'Faculty can only review questions in their own courses'
    );
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAnswerForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function findSimilarCourseQuestions(
  courseId: string,
  candidateText: string,
  excludeQuestionId?: string
): Promise<SimilarQuestionMatch[]> {
  const existing = await QuizQuestionModel.find({
    courseId: new mongoose.Types.ObjectId(courseId),
    deletedAt: null,
    status: { $in: [QuizQuestionStatus.APPROVED, QuizQuestionStatus.PENDING] },
  })
    .select('topic questionText status')
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();

  const matches: SimilarQuestionMatch[] = [];
  for (const row of existing) {
    if (excludeQuestionId && row._id.toString() === excludeQuestionId) continue;
    const sim = computeTextSimilarity(candidateText, row.questionText);
    if (sim >= DUPLICATE_SIMILARITY_WARN) {
      matches.push({
        id: row._id.toString(),
        topic: row.topic,
        questionText: row.questionText,
        similarity: sim,
        status: row.status,
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, 5);
}

export async function hydratePublicQuestions(
  docs: Array<
    Pick<
      IQuizQuestion,
      | '_id'
      | 'courseId'
      | 'contributorId'
      | 'topic'
      | 'difficulty'
      | 'type'
      | 'source'
      | 'questionText'
      | 'options'
      | 'status'
      | 'reportCount'
      | 'createdAt'
    >
  >
): Promise<QuizQuestionPublicDTO[]> {
  if (docs.length === 0) return [];

  const courseIds = Array.from(new Set(docs.map((d) => d.courseId.toString())));
  const userIds = Array.from(new Set(docs.map((d) => d.contributorId.toString())));

  const [courses, users] = await Promise.all([
    CourseModel.find({ _id: { $in: courseIds } })
      .select('courseCode courseName')
      .lean(),
    UserModel.find({ _id: { $in: userIds } })
      .select('name role')
      .lean(),
  ]);

  const courseMap = new Map(
    courses.map((c) => [
      c._id.toString(),
      { courseCode: c.courseCode, courseName: c.courseName },
    ])
  );
  const userMap = new Map(
    users.map((u) => [
      u._id.toString(),
      { id: u._id.toString(), name: u.name, role: u.role },
    ])
  );

  // Strictly omit correctAnswer and explanation
  return docs.map((d) => {
    const cid = d.courseId.toString();
    const course = courseMap.get(cid);
    const contrib = userMap.get(d.contributorId.toString());

    return {
      id: d._id.toString(),
      courseId: cid,
      courseCode: course?.courseCode || 'Course',
      courseName: course?.courseName || '',
      topic: d.topic,
      difficulty: d.difficulty,
      type: d.type,
      source: d.source ?? QuizQuestionSource.HUMAN,
      questionText: d.questionText,
      options: [...(d.options ?? [])],
      status: d.status,
      reportCount: d.reportCount ?? 0,
      contributor: contrib || {
        id: d.contributorId.toString(),
        name: 'Member',
        role: UserRole.STUDENT,
      },
      createdAt: d.createdAt.toISOString(),
    };
  });
}

async function hydrateReviewQuestions(
  docs: IQuizQuestion[]
): Promise<QuizQuestionReviewDTO[]> {
  if (docs.length === 0) return [];

  const baseList = await hydratePublicQuestions(docs);
  const questionIds = docs.map((d) => d._id);
  const reviewerIds = Array.from(
    new Set(
      docs
        .map((d) => (d.reviewedBy ? d.reviewedBy.toString() : ''))
        .filter(Boolean)
    )
  );

  const [reviewers, openReportDocs] = await Promise.all([
    reviewerIds.length > 0
      ? UserModel.find({ _id: { $in: reviewerIds } }).select('name').lean()
      : Promise.resolve([]),
    QuestionReportModel.find({
      questionId: { $in: questionIds },
      status: QuestionReportStatus.OPEN,
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const reporterIds = Array.from(
    new Set(openReportDocs.map((r) => r.reporterId.toString()))
  );
  const reporters =
    reporterIds.length > 0
      ? await UserModel.find({ _id: { $in: reporterIds } }).select('name').lean()
      : [];

  const reviewerMap = new Map(
    reviewers.map((u) => [u._id.toString(), u.name])
  );
  const reporterMap = new Map(
    reporters.map((u) => [u._id.toString(), u.name])
  );

  const reportsByQuestion = new Map<string, QuestionReportSummaryDTO[]>();
  for (const r of openReportDocs) {
    const qid = r.questionId.toString();
    const list = reportsByQuestion.get(qid) ?? [];
    list.push({
      id: r._id.toString(),
      reason: r.reason,
      details: r.details || '',
      status: r.status,
      reporterName: reporterMap.get(r.reporterId.toString()) || 'Student',
      createdAt: r.createdAt.toISOString(),
    });
    reportsByQuestion.set(qid, list);
  }

  return docs.map((d, idx) => {
    const base = baseList[idx];
    const revId = d.reviewedBy ? d.reviewedBy.toString() : null;
    return {
      ...base,
      correctAnswer: d.correctAnswer,
      explanation: d.explanation,
      rejectionReason: d.rejectionReason || '',
      pointsAwarded: d.pointsAwarded ?? 0,
      reviewedBy: revId
        ? { id: revId, name: reviewerMap.get(revId) || 'Reviewer' }
        : null,
      reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
      potentialDuplicates: d.potentialDuplicates ?? [],
      openReports: reportsByQuestion.get(d._id.toString()) ?? [],
    };
  });
}

export async function checkDuplicates(
  actor: AuthUserContext,
  courseId: string,
  questionText: string
): Promise<SimilarQuestionMatch[]> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }
  await ensureCourseMemberAccess(actor, courseId, 'check questions in this course');
  return findSimilarCourseQuestions(courseId, questionText);
}

export async function contributeQuestion(
  actor: AuthUserContext,
  input: ContributeQuestionInput,
  reqMeta?: RequestMeta
): Promise<{
  question: QuizQuestionPublicDTO;
  potentialDuplicates: SimilarQuestionMatch[];
}> {
  const course = await CourseModel.findOne({
    _id: input.courseId,
    deletedAt: null,
  });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  await ensureCourseMemberAccess(actor, input.courseId, 'contribute questions');

  const cleanText = sanitizePlainText(input.questionText);
  const similar = await findSimilarCourseQuestions(input.courseId, cleanText);

  if (
    !input.ignoreDuplicateWarning &&
    similar.some((m) => m.similarity >= DUPLICATE_SIMILARITY_BLOCK)
  ) {
    throw new AppError(
      409,
      'DUPLICATE_QUESTION_DETECTED',
      'A nearly identical question already exists in this course. Review the matching question or confirm submission if distinct.',
      { matches: similar }
    );
  }

  let normalizedOptions: string[] = [];
  let cleanCorrectAnswer = sanitizePlainText(input.correctAnswer);

  if (input.type === QuizQuestionType.MCQ) {
    normalizedOptions = Array.from(
      new Set(input.options.map((o) => sanitizePlainText(o)).filter(Boolean))
    );
    const matchedOpt = normalizedOptions.find(
      (o) => o.toLowerCase() === cleanCorrectAnswer.toLowerCase()
    );
    if (matchedOpt) cleanCorrectAnswer = matchedOpt;
  } else if (input.type === QuizQuestionType.TRUE_FALSE) {
    normalizedOptions = ['True', 'False'];
    cleanCorrectAnswer =
      cleanCorrectAnswer.toLowerCase() === 'true' ? 'True' : 'False';
  }

  const question = await QuizQuestionModel.create({
    courseId: course._id,
    contributorId: new mongoose.Types.ObjectId(actor.id),
    topic: sanitizePlainText(input.topic),
    difficulty: input.difficulty,
    type: input.type,
    questionText: cleanText,
    normalizedText: normalizeQuestionText(cleanText),
    options: normalizedOptions,
    correctAnswer: cleanCorrectAnswer,
    explanation: sanitizePlainText(input.explanation),
    status: QuizQuestionStatus.PENDING,
    potentialDuplicates: similar,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'QUIZ_QUESTION_CONTRIBUTED',
    targetType: 'QUIZ_QUESTION',
    targetId: question._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      topic: question.topic,
      difficulty: question.difficulty,
      duplicateMatches: similar.length,
    },
    reqMeta,
  });

  const facultyIds = course.facultyIds.map((f) => f.toString());
  if (facultyIds.length > 0) {
    await notifySpecificUsers({
      userIds: facultyIds,
      excludeUserId: actor.id,
      type: NotificationType.QUIZ,
      title: `Quiz question pending review (${course.courseCode})`,
      message: `${actor.name} contributed a ${question.difficulty} question on "${question.topic}".`,
      link: `/quizzes?tab=review&courseId=${course._id.toString()}`,
      courseId: course._id.toString(),
    });
  }

  const [publicDto] = await hydratePublicQuestions([question]);
  return {
    question: publicDto,
    potentialDuplicates: similar,
  };
}

export async function listQuizBank(
  viewer: AuthUserContext,
  query: ListQuizBankQuery
): Promise<{
  questions: QuizQuestionPublicDTO[];
  topics: string[];
  meta: PaginationMeta;
}> {
  const accessible = await getAccessibleCourseIds(viewer);
  const filter: Record<string, unknown> = {
    deletedAt: null,
    status: QuizQuestionStatus.APPROVED,
  };

  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    if (viewer.role !== UserRole.ADMIN && !accessible.includes(query.courseId)) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have access to this course quiz bank'
      );
    }
    filter.courseId = new mongoose.Types.ObjectId(query.courseId);
  } else if (viewer.role !== UserRole.ADMIN) {
    if (accessible.length === 0) {
      return {
        questions: [],
        topics: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }
    filter.courseId = {
      $in: accessible.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const baseCourseScopeFilter = { ...filter };

  if (query.topic) {
    filter.topic = { $regex: `^${escapeRegex(query.topic)}$`, $options: 'i' };
  }
  if (query.difficulty) {
    filter.difficulty = query.difficulty;
  }
  if (query.type) {
    filter.type = query.type;
  }
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [{ questionText: rx }, { topic: rx }];
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total, distinctTopics] = await Promise.all([
    QuizQuestionModel.find(filter)
      .select('-correctAnswer -explanation -potentialDuplicates -rejectionReason')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    QuizQuestionModel.countDocuments(filter),
    QuizQuestionModel.distinct('topic', baseCourseScopeFilter),
  ]);

  const questions = await hydratePublicQuestions(docs as unknown as IQuizQuestion[]);
  const topics = distinctTopics
    .map((t) => String(t))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return {
    questions,
    topics,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function listReviewQueue(
  actor: AuthUserContext,
  query: ListReviewQueueQuery
): Promise<{ questions: QuizQuestionReviewDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {
    deletedAt: null,
  };

  if (query.reportedOnly) {
    filter.reportCount = { $gt: 0 };
  } else {
    filter.status = query.status;
  }

  if (query.courseId) {
    await ensureFacultyOrAdminCourseScope(actor, query.courseId);
    filter.courseId = new mongoose.Types.ObjectId(query.courseId);
  } else if (actor.role !== UserRole.ADMIN) {
    if (actor.role !== UserRole.FACULTY) {
      throw new AppError(
        403,
        'AUTH_FORBIDDEN',
        'Only course faculty or administrators can access the quiz review queue'
      );
    }
    const taughtCourses = await CourseModel.find({
      facultyIds: new mongoose.Types.ObjectId(actor.id),
      deletedAt: null,
    })
      .select('_id')
      .lean();
    if (taughtCourses.length === 0) {
      return {
        questions: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }
    filter.courseId = { $in: taughtCourses.map((c) => c._id) };
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    QuizQuestionModel.find(filter)
      .sort({ reportCount: -1, createdAt: 1 })
      .skip(skip)
      .limit(query.limit),
    QuizQuestionModel.countDocuments(filter),
  ]);

  const questions = await hydrateReviewQuestions(docs);
  return {
    questions,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function reviewQuestion(
  actor: AuthUserContext,
  questionId: string,
  input: ReviewQuestionInput,
  reqMeta?: RequestMeta
): Promise<QuizQuestionReviewDTO> {
  if (!mongoose.isValidObjectId(questionId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid question ID');
  }

  const question = await QuizQuestionModel.findOne({
    _id: questionId,
    deletedAt: null,
  });
  if (!question) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Quiz question not found');
  }

  const courseId = question.courseId.toString();
  await ensureFacultyOrAdminCourseScope(actor, courseId);

  const course = await CourseModel.findById(question.courseId)
    .select('courseCode')
    .lean();

  if (input.decision === 'APPROVE') {
    if (question.status === QuizQuestionStatus.APPROVED) {
      throw new AppError(
        409,
        'QUESTION_ALREADY_APPROVED',
        'This question has already been approved'
      );
    }

    const points = QUIZ_POINTS_BY_DIFFICULTY[question.difficulty] ?? 10;
    question.status = QuizQuestionStatus.APPROVED;
    question.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    question.reviewedAt = new Date();
    question.rejectionReason = '';

    // Award points idempotently once per approved question
    const alreadyCredited = await ContributionModel.exists({
      questionId: question._id,
      action: 'QUESTION_APPROVED',
    });
    if (!alreadyCredited) {
      await ContributionModel.create({
        userId: question.contributorId,
        courseId: question.courseId,
        questionId: question._id,
        questionTopic: question.topic,
        points,
        action: 'QUESTION_APPROVED',
        reason: `Approved ${question.difficulty} ${question.type} question on "${question.topic}"`,
        awardedBy: new mongoose.Types.ObjectId(actor.id),
      });
      question.pointsAwarded = points;
    }

    await question.save();

    await recordAuditLog({
      actor: { id: actor.id, email: actor.email, role: actor.role },
      action: 'QUIZ_QUESTION_APPROVED',
      targetType: 'QUIZ_QUESTION',
      targetId: question._id.toString(),
      metadata: {
        courseCode: course?.courseCode,
        pointsAwarded: question.pointsAwarded,
        contributorId: question.contributorId.toString(),
      },
      reqMeta,
    });

    await notifySpecificUsers({
      userIds: [question.contributorId.toString()],
      excludeUserId: actor.id,
      type: NotificationType.QUIZ,
      title: `Question approved (+${question.pointsAwarded} pts)`,
      message: `Your ${course?.courseCode || 'course'} question on "${question.topic}" was approved by ${actor.name}.`,
      link: '/quizzes?tab=contributions',
      courseId,
    });
  } else {
    question.status = QuizQuestionStatus.REJECTED;
    question.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    question.reviewedAt = new Date();
    question.rejectionReason = sanitizePlainText(input.reason);
    await question.save();

    await recordAuditLog({
      actor: { id: actor.id, email: actor.email, role: actor.role },
      action: 'QUIZ_QUESTION_REJECTED',
      targetType: 'QUIZ_QUESTION',
      targetId: question._id.toString(),
      metadata: {
        courseCode: course?.courseCode,
        reason: question.rejectionReason,
      },
      reqMeta,
    });

    await notifySpecificUsers({
      userIds: [question.contributorId.toString()],
      excludeUserId: actor.id,
      type: NotificationType.QUIZ,
      title: `Question not approved (${course?.courseCode || 'Quiz'})`,
      message: `Your question on "${question.topic}" was declined: ${question.rejectionReason}`,
      link: '/quizzes?tab=contributions',
      courseId,
    });
  }

  const [dto] = await hydrateReviewQuestions([question]);
  return dto;
}

export async function reportQuestion(
  actor: AuthUserContext,
  questionId: string,
  input: ReportQuestionInput,
  reqMeta?: RequestMeta
): Promise<{ reported: boolean; reportCount: number }> {
  if (!mongoose.isValidObjectId(questionId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid question ID');
  }

  const question = await QuizQuestionModel.findOne({
    _id: questionId,
    deletedAt: null,
  });
  if (!question) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Quiz question not found');
  }
  if (question.status !== QuizQuestionStatus.APPROVED) {
    throw new AppError(
      400,
      'QUESTION_NOT_REPORTABLE',
      'Only approved quiz bank questions can be reported'
    );
  }

  const courseId = question.courseId.toString();
  await ensureCourseMemberAccess(actor, courseId, 'report a question');

  const existing = await QuestionReportModel.exists({
    questionId: question._id,
    reporterId: new mongoose.Types.ObjectId(actor.id),
  });
  if (existing) {
    throw new AppError(
      409,
      'ALREADY_REPORTED',
      'You have already reported this question'
    );
  }

  await QuestionReportModel.create({
    questionId: question._id,
    courseId: question.courseId,
    reporterId: new mongoose.Types.ObjectId(actor.id),
    reason: input.reason,
    details: sanitizePlainText(input.details || ''),
    status: QuestionReportStatus.OPEN,
  });

  question.reportCount = (question.reportCount ?? 0) + 1;
  await question.save();

  const course = await CourseModel.findById(question.courseId)
    .select('courseCode facultyIds')
    .lean();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'QUIZ_QUESTION_REPORTED',
    targetType: 'QUIZ_QUESTION',
    targetId: question._id.toString(),
    metadata: { reason: input.reason, courseCode: course?.courseCode },
    reqMeta,
  });

  if (course && course.facultyIds.length > 0) {
    await notifySpecificUsers({
      userIds: course.facultyIds.map((f) => f.toString()),
      excludeUserId: actor.id,
      type: NotificationType.QUIZ,
      title: `Quiz question reported (${course.courseCode})`,
      message: `${actor.name} flagged a question on "${question.topic}" (${input.reason}).`,
      link: `/quizzes?tab=review&courseId=${courseId}`,
      courseId,
    });
  }

  return { reported: true, reportCount: question.reportCount };
}

export async function resolveQuestionReports(
  actor: AuthUserContext,
  questionId: string,
  input: ResolveReportsInput,
  reqMeta?: RequestMeta
): Promise<QuizQuestionReviewDTO> {
  if (!mongoose.isValidObjectId(questionId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid question ID');
  }

  const question = await QuizQuestionModel.findOne({
    _id: questionId,
    deletedAt: null,
  });
  if (!question) {
    throw new AppError(404, 'QUESTION_NOT_FOUND', 'Quiz question not found');
  }

  await ensureFacultyOrAdminCourseScope(actor, question.courseId.toString());

  const newReportStatus =
    input.action === 'UNPUBLISH_QUESTION'
      ? QuestionReportStatus.RESOLVED
      : QuestionReportStatus.DISMISSED;

  await QuestionReportModel.updateMany(
    { questionId: question._id, status: QuestionReportStatus.OPEN },
    {
      $set: {
        status: newReportStatus,
        resolvedBy: new mongoose.Types.ObjectId(actor.id),
        resolvedAt: new Date(),
      },
    }
  );

  question.reportCount = 0;
  if (input.action === 'UNPUBLISH_QUESTION') {
    question.status = QuizQuestionStatus.REJECTED;
    question.rejectionReason =
      sanitizePlainText(input.reason) || 'Unpublished after quality report review';
    question.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    question.reviewedAt = new Date();
  }
  await question.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'QUIZ_REPORTS_RESOLVED',
    targetType: 'QUIZ_QUESTION',
    targetId: question._id.toString(),
    metadata: { resolution: input.action },
    reqMeta,
  });

  const [dto] = await hydrateReviewQuestions([question]);
  return dto;
}

export async function startPracticeQuiz(
  actor: AuthUserContext,
  input: StartPracticeInput,
  reqMeta?: RequestMeta
): Promise<QuizAttemptDTO> {
  const course = await CourseModel.findOne({
    _id: input.courseId,
    deletedAt: null,
  });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  await ensureCourseMemberAccess(actor, input.courseId, 'practice quizzes');

  const filter: Record<string, unknown> = {
    courseId: course._id,
    deletedAt: null,
  };
  if (input.includeMyPrivateAi) {
    filter.$or = [
      { status: QuizQuestionStatus.APPROVED },
      {
        status: QuizQuestionStatus.PENDING,
        source: QuizQuestionSource.AI,
        contributorId: new mongoose.Types.ObjectId(actor.id),
      },
    ];
  } else {
    filter.status = QuizQuestionStatus.APPROVED;
  }
  if (input.topic) {
    filter.topic = { $regex: `^${escapeRegex(input.topic)}$`, $options: 'i' };
  }
  if (input.difficulty) {
    filter.difficulty = input.difficulty;
  }

  // Strictly exclude correctAnswer and explanation when sampling for practice
  const pool = await QuizQuestionModel.find(filter)
    .select('-correctAnswer -explanation')
    .lean();

  if (pool.length === 0) {
    throw new AppError(
      404,
      'NO_QUESTIONS_AVAILABLE',
      input.includeMyPrivateAi
        ? 'No approved or personal AI-generated questions match your selected filters'
        : 'No approved questions match your selected course/topic/difficulty filters'
    );
  }

  const shuffled = shuffleInPlace([...pool]);
  const selected = shuffled.slice(0, Math.min(input.count, shuffled.length));
  const timeLimitSeconds = input.timeLimitSeconds ?? selected.length * 60;

  const attempt = await QuizAttemptModel.create({
    userId: new mongoose.Types.ObjectId(actor.id),
    courseId: course._id,
    status: QuizAttemptStatus.IN_PROGRESS,
    filters: {
      topic: input.topic || null,
      difficulty: input.difficulty || null,
      requestedCount: input.count,
    },
    questionIds: selected.map((q) => q._id),
    timeLimitSeconds,
    startedAt: new Date(),
    totalQuestions: selected.length,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'QUIZ_PRACTICE_STARTED',
    targetType: 'QUIZ_ATTEMPT',
    targetId: attempt._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      questionCount: selected.length,
      topic: input.topic || null,
      includeMyPrivateAi: Boolean(input.includeMyPrivateAi),
    },
    reqMeta,
  });

  const practiceQuestions: QuizPracticeQuestionDTO[] = selected.map((q) => ({
    id: q._id.toString(),
    topic: q.topic,
    difficulty: q.difficulty,
    type: q.type,
    source: q.source ?? QuizQuestionSource.HUMAN,
    questionText: q.questionText,
    options: [...(q.options ?? [])],
  }));

  return {
    id: attempt._id.toString(),
    courseId: course._id.toString(),
    courseCode: course.courseCode,
    courseName: course.courseName,
    status: attempt.status,
    filters: attempt.filters,
    totalQuestions: attempt.totalQuestions,
    timeLimitSeconds: attempt.timeLimitSeconds,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: null,
    durationSeconds: 0,
    score: 0,
    correctCount: 0,
    percentage: 0,
    questions: practiceQuestions,
    topicWeaknesses: [],
  };
}

function buildSubmittedAttemptDTO(
  attempt: IQuizAttempt,
  course: { courseCode: string; courseName: string } | null,
  questionMap: Map<string, IQuizQuestion>
): QuizAttemptDTO {
  const reviewItems: QuizAttemptReviewItem[] = attempt.answers.map((ans) => {
    const q = questionMap.get(ans.questionId.toString());
    return {
      questionId: ans.questionId.toString(),
      topic: q?.topic || 'Topic',
      difficulty: q?.difficulty || QuizDifficulty.MEDIUM,
      type: q?.type || QuizQuestionType.MCQ,
      questionText: q?.questionText || 'Question unavailable',
      options: q ? [...(q.options ?? [])] : [],
      userAnswer: ans.userAnswer,
      correctAnswer: q?.correctAnswer || '',
      isCorrect: ans.isCorrect,
      explanation: q?.explanation || '',
    };
  });

  return {
    id: attempt._id.toString(),
    courseId: attempt.courseId.toString(),
    courseCode: course?.courseCode || 'Course',
    courseName: course?.courseName || '',
    status: attempt.status,
    filters: attempt.filters,
    totalQuestions: attempt.totalQuestions,
    timeLimitSeconds: attempt.timeLimitSeconds,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    durationSeconds: attempt.durationSeconds,
    score: attempt.score,
    correctCount: attempt.correctCount,
    percentage: attempt.percentage,
    reviewItems,
    topicWeaknesses: attempt.topicWeaknesses ?? [],
  };
}

export async function submitPracticeQuiz(
  actor: AuthUserContext,
  attemptId: string,
  input: SubmitPracticeInput,
  reqMeta?: RequestMeta
): Promise<QuizAttemptDTO> {
  if (!mongoose.isValidObjectId(attemptId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid quiz attempt ID');
  }

  const attempt = await QuizAttemptModel.findById(attemptId);
  if (!attempt) {
    throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Quiz attempt not found');
  }

  if (
    actor.role !== UserRole.ADMIN &&
    attempt.userId.toString() !== actor.id
  ) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'You can only submit your own quiz attempt'
    );
  }

  if (attempt.status === QuizAttemptStatus.SUBMITTED) {
    throw new AppError(
      409,
      'ATTEMPT_ALREADY_SUBMITTED',
      'This quiz attempt has already been submitted'
    );
  }

  const [questions, course] = await Promise.all([
    QuizQuestionModel.find({ _id: { $in: attempt.questionIds } }),
    CourseModel.findById(attempt.courseId)
      .select('courseCode courseName')
      .lean(),
  ]);

  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));
  const submittedAnswerMap = new Map(
    input.answers.map((a) => [a.questionId, sanitizePlainText(a.answer)])
  );

  let correctCount = 0;
  const topicBuckets = new Map<string, { total: number; correct: number }>();

  const gradedAnswers = attempt.questionIds.map((qid) => {
    const qIdStr = qid.toString();
    const q = questionMap.get(qIdStr);
    const userAnswer = submittedAnswerMap.get(qIdStr) ?? '';
    const isCorrect = q
      ? normalizeAnswerForComparison(userAnswer) !== '' &&
        normalizeAnswerForComparison(userAnswer) ===
          normalizeAnswerForComparison(q.correctAnswer)
      : false;

    if (isCorrect) correctCount += 1;

    const topicName = q?.topic || 'General';
    const bucket = topicBuckets.get(topicName) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (isCorrect) bucket.correct += 1;
    topicBuckets.set(topicName, bucket);

    return {
      questionId: qid,
      userAnswer,
      isCorrect,
    };
  });

  const topicWeaknesses: TopicWeaknessSummary[] = Array.from(
    topicBuckets.entries()
  )
    .map(([topic, stats]) => {
      const accuracyPercent =
        stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      const status =
        accuracyPercent >= 80
          ? TopicMasteryStatus.STRONG
          : accuracyPercent >= 50
            ? TopicMasteryStatus.MODERATE
            : TopicMasteryStatus.WEAK;
      return {
        topic,
        total: stats.total,
        correct: stats.correct,
        accuracyPercent,
        status,
      };
    })
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  const submittedAt = new Date();
  const computedElapsed = Math.max(
    1,
    Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
  );
  const durationSeconds =
    input.elapsedSeconds !== undefined
      ? Math.min(attempt.timeLimitSeconds, input.elapsedSeconds)
      : Math.min(attempt.timeLimitSeconds, computedElapsed);

  const totalQuestions = attempt.questionIds.length;
  const percentage =
    totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  attempt.status = QuizAttemptStatus.SUBMITTED;
  attempt.answers = gradedAnswers;
  attempt.score = correctCount;
  attempt.correctCount = correctCount;
  attempt.totalQuestions = totalQuestions;
  attempt.percentage = percentage;
  attempt.topicWeaknesses = topicWeaknesses;
  attempt.submittedAt = submittedAt;
  attempt.durationSeconds = durationSeconds;
  await attempt.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'QUIZ_PRACTICE_SUBMITTED',
    targetType: 'QUIZ_ATTEMPT',
    targetId: attempt._id.toString(),
    metadata: {
      courseCode: course?.courseCode,
      score: correctCount,
      totalQuestions,
      percentage,
    },
    reqMeta,
  });

  return buildSubmittedAttemptDTO(attempt, course, questionMap);
}

export async function listMyAttempts(
  actor: AuthUserContext,
  query: ListAttemptsQuery
): Promise<{ attempts: QuizAttemptDTO[]; meta: PaginationMeta }> {
  const filter: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(actor.id),
  };
  if (query.courseId) {
    filter.courseId = new mongoose.Types.ObjectId(query.courseId);
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    QuizAttemptModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    QuizAttemptModel.countDocuments(filter),
  ]);

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

  // Never include answer keys for IN_PROGRESS attempts in list view
  const attempts: QuizAttemptDTO[] = docs.map((d) => {
    const course = courseMap.get(d.courseId.toString());
    return {
      id: d._id.toString(),
      courseId: d.courseId.toString(),
      courseCode: course?.courseCode || 'Course',
      courseName: course?.courseName || '',
      status: d.status,
      filters: d.filters,
      totalQuestions: d.totalQuestions,
      timeLimitSeconds: d.timeLimitSeconds,
      startedAt: d.startedAt.toISOString(),
      submittedAt: d.submittedAt ? d.submittedAt.toISOString() : null,
      durationSeconds: d.durationSeconds,
      score: d.score,
      correctCount: d.correctCount,
      percentage: d.percentage,
      topicWeaknesses: d.topicWeaknesses ?? [],
    };
  });

  return {
    attempts,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function getAttemptById(
  actor: AuthUserContext,
  attemptId: string
): Promise<QuizAttemptDTO> {
  if (!mongoose.isValidObjectId(attemptId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid quiz attempt ID');
  }

  const attempt = await QuizAttemptModel.findById(attemptId);
  if (!attempt) {
    throw new AppError(404, 'ATTEMPT_NOT_FOUND', 'Quiz attempt not found');
  }

  if (
    actor.role !== UserRole.ADMIN &&
    attempt.userId.toString() !== actor.id
  ) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'You can only view your own quiz attempts'
    );
  }

  const course = await CourseModel.findById(attempt.courseId)
    .select('courseCode courseName')
    .lean();

  if (attempt.status === QuizAttemptStatus.IN_PROGRESS) {
    // Strictly omit correctAnswer and explanation before submission
    const questions = await QuizQuestionModel.find({
      _id: { $in: attempt.questionIds },
    })
      .select('-correctAnswer -explanation')
      .lean();
    const qMap = new Map(questions.map((q) => [q._id.toString(), q]));
    const practiceQuestions: QuizPracticeQuestionDTO[] = attempt.questionIds
      .map((qid) => qMap.get(qid.toString()))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .map((q) => ({
        id: q._id.toString(),
        topic: q.topic,
        difficulty: q.difficulty,
        type: q.type,
        source: q.source ?? QuizQuestionSource.HUMAN,
        questionText: q.questionText,
        options: [...(q.options ?? [])],
      }));

    return {
      id: attempt._id.toString(),
      courseId: attempt.courseId.toString(),
      courseCode: course?.courseCode || 'Course',
      courseName: course?.courseName || '',
      status: attempt.status,
      filters: attempt.filters,
      totalQuestions: attempt.totalQuestions,
      timeLimitSeconds: attempt.timeLimitSeconds,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: null,
      durationSeconds: 0,
      score: 0,
      correctCount: 0,
      percentage: 0,
      questions: practiceQuestions,
      topicWeaknesses: [],
    };
  }

  const questions = await QuizQuestionModel.find({
    _id: { $in: attempt.questionIds },
  });
  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));
  return buildSubmittedAttemptDTO(attempt, course, questionMap);
}

export async function getMyContributions(actor: AuthUserContext): Promise<{
  totalPoints: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  ledger: ContributionLedgerDTO[];
  submissions: QuizQuestionReviewDTO[];
}> {
  const userObjId = new mongoose.Types.ObjectId(actor.id);
  const [ledgerDocs, submittedQuestions] = await Promise.all([
    ContributionModel.find({ userId: userObjId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    QuizQuestionModel.find({
      contributorId: userObjId,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .limit(100),
  ]);

  const courseIds = Array.from(
    new Set(ledgerDocs.map((l) => l.courseId.toString()))
  );
  const courses =
    courseIds.length > 0
      ? await CourseModel.find({ _id: { $in: courseIds } })
          .select('courseCode')
          .lean()
      : [];
  const courseMap = new Map(
    courses.map((c) => [c._id.toString(), c.courseCode])
  );

  const totalPoints = ledgerDocs.reduce((sum, item) => sum + item.points, 0);
  const ledger: ContributionLedgerDTO[] = ledgerDocs.map((l) => ({
    id: l._id.toString(),
    courseId: l.courseId.toString(),
    courseCode: courseMap.get(l.courseId.toString()) || 'Course',
    questionId: l.questionId ? l.questionId.toString() : null,
    questionTopic: l.questionTopic || 'General',
    points: l.points,
    action: l.action,
    reason: l.reason,
    createdAt: l.createdAt.toISOString(),
  }));

  const submissions = await hydrateReviewQuestions(submittedQuestions);
  const approvedCount = submissions.filter(
    (s) => s.status === QuizQuestionStatus.APPROVED
  ).length;
  const pendingCount = submissions.filter(
    (s) => s.status === QuizQuestionStatus.PENDING
  ).length;
  const rejectedCount = submissions.filter(
    (s) => s.status === QuizQuestionStatus.REJECTED
  ).length;

  return {
    totalPoints,
    approvedCount,
    pendingCount,
    rejectedCount,
    ledger,
    submissions,
  };
}

export async function getContributorLeaderboard(
  viewer: AuthUserContext,
  query: LeaderboardQuery
): Promise<LeaderboardEntryDTO[]> {
  const matchStage: Record<string, unknown> = {};

  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    await ensureCourseMemberAccess(
      viewer,
      query.courseId,
      'view the course contributor leaderboard'
    );
    matchStage.courseId = new mongoose.Types.ObjectId(query.courseId);
  } else if (viewer.role !== UserRole.ADMIN) {
    const accessible = await getAccessibleCourseIds(viewer);
    if (accessible.length === 0) return [];
    matchStage.courseId = {
      $in: accessible.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const aggregated = await ContributionModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalPoints: number;
    approvedQuestionsCount: number;
  }>([
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalPoints: { $sum: '$points' },
        approvedQuestionsCount: {
          $sum: { $cond: [{ $eq: ['$action', 'QUESTION_APPROVED'] }, 1, 0] },
        },
      },
    },
    { $sort: { totalPoints: -1, approvedQuestionsCount: -1 } },
    { $limit: query.limit },
  ]);

  if (aggregated.length === 0) return [];

  const users = await UserModel.find({
    _id: { $in: aggregated.map((a) => a._id) },
    deletedAt: null,
  })
    .select('name department batch')
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const entries: LeaderboardEntryDTO[] = [];
  for (const row of aggregated) {
    const u = userMap.get(row._id.toString());
    if (!u) continue;
    entries.push({
      rank: entries.length + 1,
      userId: row._id.toString(),
      name: u.name,
      department: u.department,
      batch: u.batch ?? null,
      totalPoints: row.totalPoints,
      approvedQuestionsCount: row.approvedQuestionsCount,
    });
  }

  return entries;
}
