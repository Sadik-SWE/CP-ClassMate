import { z } from 'zod';
import { QuizDifficulty, QuizQuestionType } from '../../../shared/types.ts';

const objectIdRegex = /^[a-f\d]{24}$/i;

export const conversationIdParamSchema = z.object({
  conversationId: z.string().regex(objectIdRegex, 'Invalid conversation ID'),
});

export const topicIdParamAiSchema = z.object({
  topicId: z.string().regex(objectIdRegex, 'Invalid topic ID'),
});

export const listConversationsQuerySchema = z.object({
  courseId: z.string().regex(objectIdRegex).optional().or(z.literal('')),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

export const studyAskSchema = z.object({
  courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
  resourceId: z
    .string()
    .regex(objectIdRegex, 'Invalid resource ID')
    .optional()
    .nullable()
    .or(z.literal('')),
  conversationId: z
    .string()
    .regex(objectIdRegex, 'Invalid conversation ID')
    .optional()
    .nullable()
    .or(z.literal('')),
  question: z
    .string()
    .trim()
    .min(3, 'Please enter a question of at least 3 characters')
    .max(1500),
});

export const studySummarizeSchema = z.object({
  courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
  resourceId: z.string().regex(objectIdRegex, 'Invalid resource ID'),
});

export const generateAiQuizSchema = z.object({
  courseId: z.string().regex(objectIdRegex, 'Invalid course ID'),
  resourceId: z.string().regex(objectIdRegex, 'Invalid resource ID'),
  count: z.coerce.number().int().min(1).max(10).default(5),
  difficulty: z
    .enum([QuizDifficulty.EASY, QuizDifficulty.MEDIUM, QuizDifficulty.HARD])
    .optional(),
  topic: z.string().trim().max(120).optional(),
});

export const presentationAssistSchema = z.object({
  topicId: z.string().regex(objectIdRegex, 'Invalid presentation topic ID'),
  focusNotes: z.string().trim().max(600).optional(),
});

export const savePresentationBriefSchema = z.object({
  explanation: z.string().trim().min(10).max(4000),
  subtopics: z.array(z.string().trim().min(1).max(200)).min(1).max(15),
  outline: z
    .array(
      z.object({
        section: z.string().trim().min(1).max(250),
        keyPoints: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
      })
    )
    .min(1)
    .max(12),
  discussionPoints: z.array(z.string().trim().min(1).max(400)).min(1).max(12),
  possibleQuestions: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(500),
        suggestedAnswer: z.string().trim().min(3).max(1500),
      })
    )
    .min(1)
    .max(12),
  conclusion: z.string().trim().min(10).max(2000),
});

// Strict Zod schema validating Gemini JSON quiz output
export const geminiGeneratedQuestionItemSchema = z
  .object({
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
  })
  .superRefine((val, ctx) => {
    if (val.type === QuizQuestionType.MCQ) {
      const cleaned = Array.from(new Set(val.options.map((o) => o.trim()).filter(Boolean)));
      if (cleaned.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'MCQ requires at least 2 distinct options',
        });
      }
      if (!cleaned.some((o) => o.toLowerCase() === val.correctAnswer.trim().toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: 'MCQ correctAnswer must match one of its options',
        });
      }
    } else if (val.type === QuizQuestionType.TRUE_FALSE) {
      const norm = val.correctAnswer.trim().toLowerCase();
      if (norm !== 'true' && norm !== 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correctAnswer'],
          message: 'TRUE_FALSE correctAnswer must be True or False',
        });
      }
    }
  });

export const geminiGeneratedQuizPayloadSchema = z.object({
  questions: z.array(geminiGeneratedQuestionItemSchema).min(1).max(12),
});

export const geminiNoteSummarySchema = z.object({
  summary: z.string().trim().min(20).max(4000),
  keyTakeaways: z.array(z.string().trim().min(3).max(400)).min(2).max(10),
});

export const geminiPresentationBriefSchema = savePresentationBriefSchema;

export type StudyAskInput = z.infer<typeof studyAskSchema>;
export type StudySummarizeInput = z.infer<typeof studySummarizeSchema>;
export type GenerateAiQuizInput = z.infer<typeof generateAiQuizSchema>;
export type PresentationAssistInput = z.infer<typeof presentationAssistSchema>;
export type SavePresentationBriefInput = z.infer<typeof savePresentationBriefSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
