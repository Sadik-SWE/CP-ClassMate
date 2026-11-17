import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { validate } from '../../middleware/validate.ts';
import * as quizzesController from './quizzes.controller.ts';
import {
  attemptIdParamSchema,
  checkDuplicateSchema,
  contributeQuestionSchema,
  leaderboardQuerySchema,
  listAttemptsQuerySchema,
  listQuizBankQuerySchema,
  listReviewQueueQuerySchema,
  questionIdParamSchema,
  reportQuestionSchema,
  resolveReportsSchema,
  reviewQuestionSchema,
  startPracticeSchema,
  submitPracticeSchema,
} from './quizzes.validation.ts';

export const quizzesRouter = Router();

quizzesRouter.use(authenticate);

// Quiz Bank (never returns correctAnswer or explanation)
quizzesRouter.get(
  '/questions',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ query: listQuizBankQuerySchema }),
  quizzesController.listQuizBank
);

// Duplicate detection & Question contribution (Student, CR, Faculty, Admin)
quizzesRouter.post(
  '/questions/check-duplicate',
  authorize(Permission.QUIZ_CONTRIBUTE),
  validate({ body: checkDuplicateSchema }),
  quizzesController.checkDuplicates
);

quizzesRouter.post(
  '/questions',
  authorize(Permission.QUIZ_CONTRIBUTE),
  validate({ body: contributeQuestionSchema }),
  quizzesController.contributeQuestion
);

// Review Queue (Faculty for own courses, Admin)
quizzesRouter.get(
  '/review-queue',
  authorize(Permission.QUIZ_REVIEW_FACULTY),
  validate({ query: listReviewQueueQuerySchema }),
  quizzesController.listReviewQueue
);

quizzesRouter.patch(
  '/questions/:questionId/review',
  authorize(Permission.QUIZ_REVIEW_FACULTY),
  validate({ params: questionIdParamSchema, body: reviewQuestionSchema }),
  quizzesController.reviewQuestion
);

quizzesRouter.post(
  '/questions/:questionId/resolve-reports',
  authorize(Permission.QUIZ_REVIEW_FACULTY),
  validate({ params: questionIdParamSchema, body: resolveReportsSchema }),
  quizzesController.resolveReports
);

// Report Question (Any course member)
quizzesRouter.post(
  '/questions/:questionId/report',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ params: questionIdParamSchema, body: reportQuestionSchema }),
  quizzesController.reportQuestion
);

// Timed Practice & Server-Side Scoring
quizzesRouter.post(
  '/practice/start',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ body: startPracticeSchema }),
  quizzesController.startPractice
);

quizzesRouter.post(
  '/practice/:attemptId/submit',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ params: attemptIdParamSchema, body: submitPracticeSchema }),
  quizzesController.submitPractice
);

quizzesRouter.get(
  '/attempts',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ query: listAttemptsQuerySchema }),
  quizzesController.listMyAttempts
);

quizzesRouter.get(
  '/attempts/:attemptId',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ params: attemptIdParamSchema }),
  quizzesController.getAttempt
);

// Contributor Credit & Leaderboard
quizzesRouter.get(
  '/contributions/me',
  authorize(Permission.QUIZ_PRACTICE),
  quizzesController.getMyContributions
);

quizzesRouter.get(
  '/leaderboard',
  authorize(Permission.QUIZ_PRACTICE),
  validate({ query: leaderboardQuerySchema }),
  quizzesController.getLeaderboard
);
