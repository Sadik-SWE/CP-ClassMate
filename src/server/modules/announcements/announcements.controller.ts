import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../middleware/errorHandler.ts';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as announcementsService from './announcements.service.ts';
import type {
  CreateAnnouncementInput,
  ListAnnouncementsQuery,
  UpdateAnnouncementInput,
} from './announcements.validation.ts';

function getReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

export async function listAnnouncements(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const query = req.validated?.query as ListAnnouncementsQuery;
    const { announcements, meta } = await announcementsService.listAnnouncements(
      req.authUser,
      query
    );
    sendSuccess(res, 200, 'Announcements retrieved.', { announcements }, meta);
  } catch (err) {
    next(err);
  }
}

export async function createAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const input = req.validated?.body as CreateAnnouncementInput;
    const announcement = await announcementsService.createAnnouncement(
      req.authUser,
      input,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Announcement published.', { announcement });
  } catch (err) {
    next(err);
  }
}

export async function updateAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { announcementId } = (req.validated?.params ?? {}) as {
      announcementId: string;
    };
    const input = req.validated?.body as UpdateAnnouncementInput;
    const announcement = await announcementsService.updateAnnouncement(
      req.authUser,
      announcementId,
      input,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Announcement updated.', { announcement });
  } catch (err) {
    next(err);
  }
}

export async function withdrawAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.authUser) {
      throw new AppError(401, 'AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const { announcementId } = (req.validated?.params ?? {}) as {
      announcementId: string;
    };
    const announcement = await announcementsService.withdrawAnnouncement(
      req.authUser,
      announcementId,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Announcement withdrawn.', { announcement });
  } catch (err) {
    next(err);
  }
}
