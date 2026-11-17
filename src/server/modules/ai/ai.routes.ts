import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { aiLimiter } from '../../middleware/rateLimit.ts';
import { validate } from '../../middleware/validate.ts';
import * as aiController from './ai.controller.ts';
import {
  conversationIdParamSchema,
  generateAiQuizSchema,
  listConversationsQuerySchema,
  presentationAssistSchema,
  savePresentationBriefSchema,
  studyAskSchema,
  studySummarizeSchema,
  topicIdParamAiSchema,
} from './ai.validation.ts';

export const aiRouter = Router();

aiRouter.use(authenticate);

aiRouter.get('/quota', authorize(Permission.AI_STUDY_USE), aiController.getQuota);

aiRouter.get(
  '/conversations',
  authorize(Permission.AI_STUDY_USE),
  validate({ query: listConversationsQuerySchema }),
  aiController.listConversations
);

aiRouter.get(
  '/conversations/:conversationId',
  authorize(Permission.AI_STUDY_USE),
  validate({ params: conversationIdParamSchema }),
  aiController.getConversation
);

aiRouter.delete(
  '/conversations/:conversationId',
  authorize(Permission.AI_STUDY_USE),
  validate({ params: conversationIdParamSchema }),
  aiController.deleteConversation
);

aiRouter.post(
  '/study/ask',
  authorize(Permission.AI_STUDY_USE),
  aiLimiter,
  validate({ body: studyAskSchema }),
  aiController.studyAskStream
);

aiRouter.post(
  '/study/summarize',
  authorize(Permission.AI_STUDY_USE),
  aiLimiter,
  validate({ body: studySummarizeSchema }),
  aiController.summarizeNote
);

aiRouter.post(
  '/quizzes/generate',
  authorize(Permission.AI_STUDY_USE, Permission.QUIZ_CONTRIBUTE),
  aiLimiter,
  validate({ body: generateAiQuizSchema }),
  aiController.generateQuiz
);

aiRouter.post(
  '/presentations/assist',
  authorize(Permission.AI_PRESENTATION_USE),
  aiLimiter,
  validate({ body: presentationAssistSchema }),
  aiController.assistPresentation
);

aiRouter.post(
  '/presentations/:topicId/save',
  authorize(Permission.AI_PRESENTATION_USE),
  validate({
    params: topicIdParamAiSchema,
    body: savePresentationBriefSchema,
  }),
  aiController.savePresentationBrief
);
