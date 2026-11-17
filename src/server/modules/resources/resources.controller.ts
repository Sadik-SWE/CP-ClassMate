import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as resourcesService from './resources.service.ts';
import type {
  ListResourcesQuery,
  UploadResourceInput,
} from './resources.validation.ts';

function getReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

export async function listResources(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const query = req.validated?.query as ListResourcesQuery;
    const { resources, meta } = await resourcesService.listCourseResources(
      req.authUser,
      courseId,
      query
    );
    sendSuccess(res, 200, 'Course resources retrieved.', { resources }, meta);
  } catch (err) {
    next(err);
  }
}

export async function uploadResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { courseId } = (req.validated?.params ?? {}) as { courseId: string };
    const input = req.validated?.body as UploadResourceInput;
    const resource = await resourcesService.uploadCourseResource(
      req.authUser,
      courseId,
      req.file,
      input,
      getReqMeta(req)
    );
    const isProcessing = resource.status === 'PROCESSING';
    sendSuccess(
      res,
      isProcessing ? 202 : 201,
      isProcessing
        ? 'PDF uploaded to GridFS and queued for AI text indexing.'
        : 'Resource uploaded and ready.',
      { resource }
    );
  } catch (err) {
    next(err);
  }
}

export async function retryIngestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { resourceId } = (req.validated?.params ?? {}) as {
      resourceId: string;
    };
    const resource = await resourcesService.retryResourceIngestion(
      req.authUser,
      resourceId,
      getReqMeta(req)
    );
    sendSuccess(res, 202, 'PDF ingestion re-queued.', { resource });
  } catch (err) {
    next(err);
  }
}

export async function downloadResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { resourceId } = (req.validated?.params ?? {}) as {
      resourceId: string;
    };
    const { resource, stream } =
      await resourcesService.openAuthorizedResourceDownload(
        req.authUser,
        resourceId
      );

    res.setHeader('Content-Type', resource.file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(resource.file.originalName)}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        next(
          new AppError(404, 'FILE_STREAM_ERROR', 'Unable to read stored file', {
            reason: streamErr.message,
          })
        );
      }
    });

    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteResource(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { resourceId } = (req.validated?.params ?? {}) as {
      resourceId: string;
    };
    await resourcesService.deleteCourseResource(
      req.authUser,
      resourceId,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Resource deleted.', { deleted: true });
  } catch (err) {
    next(err);
  }
}
