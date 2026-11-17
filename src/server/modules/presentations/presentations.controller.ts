import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as presentationsService from './presentations.service.ts';
import type {
  CoordinatePresentationTopicInput,
  CreatePresentationTopicInput,
  ListPresentationTopicsQuery,
  UpdatePresentationProgressInput,
} from './presentations.validation.ts';

export async function listCourseTopics(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { courseId } = (req.validated?.params ?? req.params) as { courseId: string };
    const query = req.validated?.query as ListPresentationTopicsQuery;
    const { topics, meta } = await presentationsService.listCourseTopics(
      courseId,
      query
    );
    sendSuccess(res, 200, 'Presentation topics retrieved.', { topics }, meta);
  } catch (err) {
    next(err);
  }
}

export async function createTopic(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { courseId } = (req.validated?.params ?? req.params) as { courseId: string };
    const body = req.validated?.body as CreatePresentationTopicInput;
    const topic = await presentationsService.createPresentationTopic(
      req.authUser!,
      courseId,
      body,
      { ip: req.ip, requestId: req.requestId }
    );
    sendSuccess(res, 201, 'Presentation topic assigned.', { topic });
  } catch (err) {
    next(err);
  }
}

export async function coordinateTopic(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { topicId } = (req.validated?.params ?? req.params) as { topicId: string };
    const body = req.validated?.body as CoordinatePresentationTopicInput;
    const topic = await presentationsService.coordinatePresentationTopic(
      req.authUser!,
      topicId,
      body,
      { ip: req.ip, requestId: req.requestId }
    );
    sendSuccess(res, 200, 'Coordination details saved.', { topic });
  } catch (err) {
    next(err);
  }
}

export async function updateProgress(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { topicId } = (req.validated?.params ?? req.params) as { topicId: string };
    const body = req.validated?.body as UpdatePresentationProgressInput;
    const topic = await presentationsService.updatePresentationProgress(
      req.authUser!,
      topicId,
      body,
      { ip: req.ip, requestId: req.requestId }
    );
    sendSuccess(res, 200, 'Presentation progress updated.', { topic });
  } catch (err) {
    next(err);
  }
}

export async function deleteTopic(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { topicId } = (req.validated?.params ?? req.params) as { topicId: string };
    await presentationsService.deletePresentationTopic(req.authUser!, topicId, {
      ip: req.ip,
      requestId: req.requestId,
    });
    sendSuccess(res, 200, 'Presentation topic removed.', { deleted: true });
  } catch (err) {
    next(err);
  }
}
