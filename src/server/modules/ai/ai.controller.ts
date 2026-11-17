import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as aiService from './ai.service.ts';
import type {
  GenerateAiQuizInput,
  ListConversationsQuery,
  PresentationAssistInput,
  SavePresentationBriefInput,
  StudyAskInput,
  StudySummarizeInput,
} from './ai.validation.ts';

function getReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

function writeSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function getQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quota = await aiService.getQuotaStatus(req.authUser!.id);
    sendSuccess(res, 200, 'AI daily quota retrieved.', { quota });
  } catch (err) {
    next(err);
  }
}

export async function listConversations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListConversationsQuery;
    const conversations = await aiService.listUserConversations(
      req.authUser!,
      query
    );
    sendSuccess(res, 200, 'AI conversation history retrieved.', {
      conversations,
    });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = (req.validated?.params ?? req.params) as {
      conversationId: string;
    };
    const conversation = await aiService.getConversationById(
      req.authUser!,
      conversationId
    );
    sendSuccess(res, 200, 'Conversation loaded.', { conversation });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { conversationId } = (req.validated?.params ?? req.params) as {
      conversationId: string;
    };
    await aiService.deleteConversation(req.authUser!, conversationId);
    sendSuccess(res, 200, 'Conversation deleted.', { deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function studyAskStream(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as StudyAskInput;
    // Perform course access, visibility, retrieval & quota readiness checks BEFORE opening SSE headers
    const prepared = await aiService.prepareStudyAsk(req.authUser!, body);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    writeSseEvent(res, 'citations', {
      citations: prepared.citations,
      insufficientEvidence: prepared.insufficientEvidence,
    });

    try {
      const { conversation, quota } = await aiService.executeStudyStream(
        req.authUser!,
        prepared,
        body,
        {
          onDelta: (text) => {
            writeSseEvent(res, 'delta', { text });
          },
        },
        getReqMeta(req)
      );

      writeSseEvent(res, 'done', {
        conversation,
        quota,
        aiGenerated: true,
      });
    } catch (streamErr) {
      const appErr =
        streamErr instanceof AppError
          ? streamErr
          : new AppError(
              502,
              'AI_STREAM_ERROR',
              streamErr instanceof Error
                ? streamErr.message
                : 'Study Assistant stream interrupted.'
            );
      writeSseEvent(res, 'error', {
        code: appErr.code,
        message: appErr.message,
        statusCode: appErr.statusCode,
      });
    } finally {
      res.end();
    }
  } catch (err) {
    next(err);
  }
}

export async function summarizeNote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as StudySummarizeInput;
    const summary = await aiService.summarizeCourseNote(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'AI note summary generated.', summary);
  } catch (err) {
    next(err);
  }
}

export async function generateQuiz(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as GenerateAiQuizInput;
    const result = await aiService.generateAiQuizFromNote(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(
      res,
      201,
      `Generated ${result.generatedCount} AI quiz question(s) in pending review state.`,
      result
    );
  } catch (err) {
    next(err);
  }
}

export async function assistPresentation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as PresentationAssistInput;
    const result = await aiService.generatePresentationAssistantBrief(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Presentation brief generated.', result);
  } catch (err) {
    next(err);
  }
}

export async function savePresentationBrief(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { topicId } = (req.validated?.params ?? req.params) as {
      topicId: string;
    };
    const body = req.validated?.body as SavePresentationBriefInput;
    const topic = await aiService.savePresentationBriefToTopic(
      req.authUser!,
      topicId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'AI presentation brief saved to topic.', { topic });
  } catch (err) {
    next(err);
  }
}
