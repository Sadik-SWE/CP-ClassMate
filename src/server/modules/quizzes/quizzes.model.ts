import mongoose, { Schema, type Document } from 'mongoose';
import {
  QuestionReportReason,
  QuestionReportStatus,
  QuizAttemptStatus,
  QuizDifficulty,
  QuizQuestionSource,
  QuizQuestionStatus,
  QuizQuestionType,
  TopicMasteryStatus,
  type SimilarQuestionMatch,
  type TopicWeaknessSummary,
} from '../../../shared/types.ts';

export interface IQuizQuestion extends Document {
  courseId: mongoose.Types.ObjectId;
  contributorId: mongoose.Types.ObjectId;
  topic: string;
  difficulty: QuizDifficulty;
  type: QuizQuestionType;
  source: QuizQuestionSource;
  sourceResourceId?: mongoose.Types.ObjectId | null;
  questionText: string;
  normalizedText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  status: QuizQuestionStatus;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  rejectionReason: string;
  pointsAwarded: number;
  reportCount: number;
  potentialDuplicates: SimilarQuestionMatch[];
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const similarQuestionSchema = new Schema<SimilarQuestionMatch>(
  {
    id: { type: String, required: true },
    topic: { type: String, required: true },
    questionText: { type: String, required: true },
    similarity: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(QuizQuestionStatus),
      required: true,
    },
  },
  { _id: false }
);

const quizQuestionSchema = new Schema<IQuizQuestion>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    contributorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    topic: { type: String, required: true, trim: true, maxlength: 120 },
    difficulty: {
      type: String,
      enum: Object.values(QuizDifficulty),
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(QuizQuestionType),
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(QuizQuestionSource),
      default: QuizQuestionSource.HUMAN,
      index: true,
    },
    sourceResourceId: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      default: null,
    },
    questionText: { type: String, required: true, trim: true, maxlength: 2000 },
    normalizedText: { type: String, required: true, trim: true },
    options: { type: [String], default: [] },
    correctAnswer: { type: String, required: true, trim: true, maxlength: 1000 },
    explanation: { type: String, required: true, trim: true, maxlength: 2500 },
    status: {
      type: String,
      enum: Object.values(QuizQuestionStatus),
      default: QuizQuestionStatus.PENDING,
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', maxlength: 500 },
    pointsAwarded: { type: Number, default: 0, min: 0 },
    reportCount: { type: Number, default: 0, min: 0 },
    potentialDuplicates: { type: [similarQuestionSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizQuestionSchema.index({ courseId: 1, status: 1, topic: 1, difficulty: 1 });
quizQuestionSchema.index({ courseId: 1, createdAt: -1 });

export const QuizQuestionModel = mongoose.model<IQuizQuestion>(
  'QuizQuestion',
  quizQuestionSchema,
  'quizQuestions'
);

export interface IQuizAttemptAnswer {
  questionId: mongoose.Types.ObjectId;
  userAnswer: string;
  isCorrect: boolean;
}

export interface IQuizAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  status: QuizAttemptStatus;
  filters: {
    topic: string | null;
    difficulty: QuizDifficulty | null;
    requestedCount: number;
  };
  questionIds: mongoose.Types.ObjectId[];
  timeLimitSeconds: number;
  startedAt: Date;
  submittedAt?: Date | null;
  durationSeconds: number;
  answers: IQuizAttemptAnswer[];
  score: number;
  correctCount: number;
  totalQuestions: number;
  percentage: number;
  topicWeaknesses: TopicWeaknessSummary[];
  createdAt: Date;
  updatedAt: Date;
}

const attemptAnswerSchema = new Schema<IQuizAttemptAnswer>(
  {
    questionId: { type: Schema.Types.ObjectId, ref: 'QuizQuestion', required: true },
    userAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const topicWeaknessSchema = new Schema<TopicWeaknessSummary>(
  {
    topic: { type: String, required: true },
    total: { type: Number, required: true },
    correct: { type: Number, required: true },
    accuracyPercent: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(TopicMasteryStatus),
      required: true,
    },
  },
  { _id: false }
);

const quizAttemptSchema = new Schema<IQuizAttempt>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(QuizAttemptStatus),
      default: QuizAttemptStatus.IN_PROGRESS,
      index: true,
    },
    filters: {
      topic: { type: String, default: null },
      difficulty: {
        type: String,
        enum: [...Object.values(QuizDifficulty), null],
        default: null,
      },
      requestedCount: { type: Number, required: true },
    },
    questionIds: [{ type: Schema.Types.ObjectId, ref: 'QuizQuestion' }],
    timeLimitSeconds: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: 0 },
    answers: { type: [attemptAnswerSchema], default: [] },
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, required: true },
    percentage: { type: Number, default: 0 },
    topicWeaknesses: { type: [topicWeaknessSchema], default: [] },
  },
  { timestamps: true }
);

quizAttemptSchema.index({ userId: 1, createdAt: -1 });

export const QuizAttemptModel = mongoose.model<IQuizAttempt>(
  'QuizAttempt',
  quizAttemptSchema,
  'quizAttempts'
);

export interface IContribution extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  questionId: mongoose.Types.ObjectId | null;
  questionTopic: string;
  points: number;
  action: 'QUESTION_APPROVED' | 'BONUS' | 'REVOKED';
  reason: string;
  awardedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contributionSchema = new Schema<IContribution>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuizQuestion',
      default: null,
      index: true,
    },
    questionTopic: { type: String, default: '' },
    points: { type: Number, required: true },
    action: {
      type: String,
      enum: ['QUESTION_APPROVED', 'BONUS', 'REVOKED'],
      required: true,
    },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    awardedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

contributionSchema.index({ courseId: 1, userId: 1 });
contributionSchema.index({ questionId: 1, action: 1 });

export const ContributionModel = mongoose.model<IContribution>(
  'Contribution',
  contributionSchema,
  'contributions'
);

export interface IQuestionReport extends Document {
  questionId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  reason: QuestionReportReason;
  details: string;
  status: QuestionReportStatus;
  resolvedBy?: mongoose.Types.ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const questionReportSchema = new Schema<IQuestionReport>(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuizQuestion',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: Object.values(QuestionReportReason),
      required: true,
    },
    details: { type: String, default: '', trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: Object.values(QuestionReportStatus),
      default: QuestionReportStatus.OPEN,
      index: true,
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

questionReportSchema.index({ questionId: 1, reporterId: 1 }, { unique: true });

export const QuestionReportModel = mongoose.model<IQuestionReport>(
  'QuestionReport',
  questionReportSchema,
  'questionReports'
);
