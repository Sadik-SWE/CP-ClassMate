import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize, requireCourseScope } from '../../middleware/authorize.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { validate } from '../../middleware/validate.ts';
import { MAX_UPLOAD_BYTES } from '../../utils/fileSecurity.ts';
import { courseIdParamSchema } from '../courses/courses.validation.ts';
import * as resourcesController from './resources.controller.ts';
import {
  listResourcesQuerySchema,
  resourceIdParamSchema,
  uploadResourceSchema,
} from './resources.validation.ts';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
});

function handleUploadSingle(req: Request, res: Response, next: NextFunction): void {
  uploadMiddleware.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(400, 'FILE_TOO_LARGE', 'File size exceeds the 20 MB maximum')
        );
        return;
      }
      next(new AppError(400, 'UPLOAD_ERROR', err.message));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

export const resourcesRouter = Router();

resourcesRouter.use(authenticate);

resourcesRouter.get(
  '/courses/:courseId',
  authorize(Permission.RESOURCE_READ),
  validate({ params: courseIdParamSchema, query: listResourcesQuerySchema }),
  requireCourseScope(['ADMIN', 'FACULTY', 'CR', 'ENROLLED']),
  resourcesController.listResources
);

resourcesRouter.post(
  '/courses/:courseId',
  authorize(Permission.RESOURCE_MANAGE_COURSE),
  validate({ params: courseIdParamSchema }),
  requireCourseScope(['ADMIN', 'FACULTY', 'CR']),
  handleUploadSingle,
  validate({ body: uploadResourceSchema }),
  resourcesController.uploadResource
);

resourcesRouter.get(
  '/:resourceId/download',
  authorize(Permission.RESOURCE_READ),
  validate({ params: resourceIdParamSchema }),
  resourcesController.downloadResource
);

resourcesRouter.post(
  '/:resourceId/retry-ingestion',
  authorize(Permission.RESOURCE_MANAGE_COURSE),
  validate({ params: resourceIdParamSchema }),
  resourcesController.retryIngestion
);

resourcesRouter.delete(
  '/:resourceId',
  authorize(Permission.RESOURCE_MANAGE_COURSE),
  validate({ params: resourceIdParamSchema }),
  resourcesController.deleteResource
);
