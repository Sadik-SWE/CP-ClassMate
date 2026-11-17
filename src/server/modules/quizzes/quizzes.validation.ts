import { z } from 'zod';
import {
  QuestionReportReason,
  QuizDifficulty,
  QuizQuestionStatus,
  QuizQuestionType,
} from '../../../shared/types.ts';

const objectIdRegex = /^[a-f\d]{24}$/i;

export const questionIdParamSchema = z.object({
  questionId: z.string().regex(objectIdRegex, 'Invalid question ID'),
});

export const attemptIdParamSchema = z.object({
  attemptId: z.string().regex(objectIdRegex, 'Invalid quiz attempt ID'),
});

export const checkDuplicateSchema = z.object({
  courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
  questionText: z.string().trim().min(8).max(2000),
});

export const contributeQuestionSchema = z
  .object({
    courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
    topic: z.string().trim().min(2).max(120),
    difficulty: z.enum([
      QuizDifficulty.EASY,
      QuizDifficulty.MEDIUM,
      QuizDifficulty.HARD,
    ]),
    type: z.enum([
      QuizQuestionType.MCQ,
      QuizQuestionType.TRUE_FALSE,
      QuizQuestionType.SHORT_ANSWER,
    ]),
    questionText: z.string().trim().min(8).max(2000),
    options: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
    correctAnswer: z.string().trim().min(1).max(1000),
    explanation: z.string().trim().min(5).max(2500),
    ignoreDuplicateWarning: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.type === QuizQuestionType.MCQ) {
      const cleaned = Array.from(new Set(val.options.map((o) => o.trim()).filter(Boolean)));
      if (cleaned.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Multiple choice questions require at least 2 distinct options',
        });
      }
      const matchesOption = cleaned.some(
        (o) => o.toLowerCase() === val.correctAnswer.trim().toLowerCase()
      );
      if (!matchesOption) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: 'Correct answer must match one of the provided MCQ options',
        });
      }
    } else if (val.type === QuizQuestionType.TRUE_FALSE) {
      const norm = val.correctAnswer.trim().toLowerCase();
      if (norm !== 'true' && norm !== 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: 'True/False correct answer must be "True" or "False"',
        });
      }
    }
  });

export const listQuizBankQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  courseId: z.string().regex(objectIdRegex).optional().or(z.literal('')),
  topic: z.string().trim().max(120).optional(),
  difficulty: z
    .enum([QuizDifficulty.EASY, QuizDifficulty.MEDIUM, QuizDifficulty.HARD])
    .optional()
    .or(z.literal('')),
  type: z
    .enum([
      QuizQuestionType.MCQ,
      QuizQuestionType.TRUE_FALSE,
      QuizQuestionType.SHORT_ANSWER,
    ])
    .optional()
    .or(z.literal('')),
  search: z.string().trim().max(120).optional(),
});

export const listReviewQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  courseId: z.string().regex(objectIdRegex).optional().or(z.literal('')),
  status: z
    .enum([
      QuizQuestionStatus.PENDING,
      QuizQuestionStatus.APPROVED,
      QuizQuestionStatus.REJECTED,
    ])
    .default(QuizQuestionStatus.PENDING),
  reportedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const reviewQuestionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().max(500).default(''),
  })
  .superRefine((val, ctx) => {
    if (val.decision === 'REJECT' && val.reason.trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Please provide a rejection reason (at least 3 characters)',
      });
    }
  });

export const reportQuestionSchema = z.object({
  reason: z.enum([
    QuestionReportReason.WRONG_ANSWER,
    QuestionReportReason.UNCLEAR,
    QuestionReportReason.DUPLICATE,
    QuestionReportReason.INAPPROPRIATE,
    QuestionReportReason.OTHER,
  ]),
  details: z.string().trim().max(1000).default(''),
});

export const resolveReportsSchema = z.object({
  action: z.enum(['DISMISS_REPORTS', 'UNPUBLISH_QUESTION']),
  reason: z.string().trim().max(500).default(''),
});

export const startPracticeSchema = z.object({
  courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
  topic: z.string().trim().max(120).optional().or(z.literal('')),
  difficulty: z
    .enum([QuizDifficulty.EASY, QuizDifficulty.MEDIUM, QuizDifficulty.HARD])
    .optional()
    .or(z.literal('')),
  count: z.coerce.number().int().min(1).max(30).default(10),
  timeLimitSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  includeMyPrivateAi: z.boolean().default(false),
});

export const submitPracticeSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(objectIdRegex, 'Invalid question ID'),
        answer: z.string().max(1000).default(''),
      })
    )
    .max(50),
  elapsedSeconds: z.coerce.number().int().min(0).max(7200).optional(),
});

export const leaderboardQuerySchema = z.object({
  courseId: z.string().regex(objectIdRegex).optional().or(z.literal('')),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listAttemptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  courseId: z.string().regex(objectIdRegex).optional().or(z.literal('')),
});

export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>;
export type ContributeQuestionInput = z.infer<typeof contributeQuestionSchema>;
export type ListQuizBankQuery = z.infer<typeof listQuizBankQuerySchema>;
export type ListReviewQueueQuery = z.infer<typeof listReviewQueueQuerySchema>;
export type ReviewQuestionInput = z.infer<typeof reviewQuestionSchema>;
export type ReportQuestionInput = z.infer<typeof reportQuestionSchema>;
export type ResolveReportsInput = z.infer<typeof resolveReportsSchema>;
export type StartPracticeInput = z.infer<typeof startPracticeSchema>;
export type SubmitPracticeInput = z.infer<typeof submitPracticeSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type ListAttemptsQuery = z.infer<typeof listAttemptsQuerySchema>;
