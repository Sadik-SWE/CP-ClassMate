import crypto from 'crypto';
import mongoose from 'mongoose';
import type { GridFSBucketReadStream } from 'mongodb';
import { ResourceModel, type IResource } from './resources.model.ts';
import { DocumentChunkModel } from '../ai/ai.model.ts';
import { chunkTextPages } from '../ai/chunking.ts';
import { embedDocumentTexts } from '../ai/gemini.service.ts';
import { CourseModel } from '../courses/courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import {
  isAssignedCR,
  isCourseFaculty,
  isEnrolled,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { notifyCourseMembers } from '../notifications/notifications.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import { logger } from '../../utils/logger.ts';
import {
  extractPdfPagesFromBuffer,
  sanitizeFilename,
  validateFileSignature,
} from '../../utils/fileSecurity.ts';
import {
  NotificationType,
  ResourceStatus,
  ResourceVisibility,
  UserRole,
  type PaginationMeta,
  type ResourceDTO,
} from '../../../shared/types.ts';
import type {
  ListResourcesQuery,
  UploadResourceInput,
} from './resources.validation.ts';

function getGridFSBucket(): mongoose.mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'Database connection is not ready for file storage'
    );
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'resources' });
}

async function readGridFsBuffer(gridFsId: mongoose.Types.ObjectId): Promise<Buffer> {
  const bucket = getGridFSBucket();
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = bucket.openDownloadStream(gridFsId);
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function hydrateResources(docs: IResource[]): Promise<ResourceDTO[]> {
  if (docs.length === 0) return [];

  const uploaderIds = Array.from(
    new Set(docs.map((d) => d.uploadedBy.toString()))
  );
  const uploaders = await UserModel.find({ _id: { $in: uploaderIds } })
    .select('name role')
    .lean();
  const uploaderMap = new Map(
    uploaders.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name, role: u.role }])
  );

  return docs.map((doc) => ({
    id: doc._id.toString(),
    courseId: doc.courseId.toString(),
    title: doc.title,
    description: doc.description || '',
    type: doc.type,
    visibility: doc.visibility,
    status: doc.status,
    file: {
      storageKey: doc.file.storageKey,
      originalName: doc.file.originalName,
      mimeType: doc.file.mimeType,
      size: doc.file.size,
    },
    pageCount: doc.pageCount ?? null,
    chunkCount: doc.chunkCount ?? 0,
    ingestionError: doc.ingestionError ?? null,
    hasExtractedText: Boolean(doc.pageCount && doc.pageCount > 0),
    uploadedBy: uploaderMap.get(doc.uploadedBy.toString()) || {
      id: doc.uploadedBy.toString(),
      name: 'Course Member',
      role: UserRole.STUDENT,
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

/**
 * Async background PDF ingestion job:
 * Reads stored PDF from GridFS -> extracts per-page text -> chunks (~500 tokens, 50 overlap)
 * -> embeds with Gemini embeddings -> stores in documentChunks -> marks resource READY or FAILED.
 */
export async function runPdfIngestionJob(resourceId: string): Promise<void> {
  const resource = await ResourceModel.findOne({
    _id: resourceId,
    deletedAt: null,
  });
  if (!resource || !resource.file.gridFsId) {
    return;
  }

  try {
    const buffer = await readGridFsBuffer(resource.file.gridFsId);
    const extracted = await extractPdfPagesFromBuffer(buffer);

    if (extracted.pages.length === 0 || !extracted.text.trim()) {
      throw new Error(
        'No extractable text found in this PDF. Scanned image-only PDFs cannot be indexed for AI Study Assistant.'
      );
    }

    const chunks = chunkTextPages(extracted.pages, {
      targetTokens: 500,
      overlapTokens: 50,
    });

    if (chunks.length === 0) {
      throw new Error('Could not generate text chunks from PDF content.');
    }

    const embeddings = await embedDocumentTexts(chunks.map((c) => c.content));

    await DocumentChunkModel.deleteMany({ resourceId: resource._id });
    await DocumentChunkModel.insertMany(
      chunks.map((chunk, idx) => ({
        resourceId: resource._id,
        courseId: resource.courseId,
        visibility: resource.visibility,
        fileName: resource.file.originalName,
        resourceTitle: resource.title,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        tokenCount: chunk.tokenCount,
        content: chunk.content,
        embedding: embeddings[idx],
      }))
    );

    resource.extractedText = extracted.text.slice(0, 200_000);
    resource.pageCount = extracted.pageCount;
    resource.chunkCount = chunks.length;
    resource.ingestionError = null;
    resource.status = ResourceStatus.READY;
    await resource.save();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'PDF ingestion and embedding failed';
    logger.error({ err, resourceId }, 'Async PDF ingestion job failed');
    resource.status = ResourceStatus.FAILED;
    resource.ingestionError = message.slice(0, 950);
    await resource.save().catch(() => undefined);
  }
}

export async function uploadCourseResource(
  actor: AuthUserContext,
  courseId: string,
  file: Express.Multer.File | undefined,
  input: UploadResourceInput,
  reqMeta?: RequestMeta
): Promise<ResourceDTO> {
  if (!file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Please attach a file to upload');
  }
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  validateFileSignature(file.buffer, file.mimetype, file.originalname);

  const course = await CourseModel.findOne({ _id: courseId, deletedAt: null });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  const storageKey = crypto.randomUUID();
  const safeName = sanitizeFilename(file.originalname);

  const resource = await ResourceModel.create({
    courseId: course._id,
    title: sanitizePlainText(input.title),
    description: sanitizePlainText(input.description || ''),
    type: input.type,
    visibility: input.visibility,
    file: {
      storageKey,
      gridFsId: null,
      originalName: safeName,
      mimeType: file.mimetype,
      size: file.size,
    },
    uploadedBy: new mongoose.Types.ObjectId(actor.id),
    status: ResourceStatus.PROCESSING,
    chunkCount: 0,
    ingestionError: null,
  });

  try {
    const bucket = getGridFSBucket();
    const gridFsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(storageKey, {
        metadata: {
          contentType: file.mimetype,
          courseId: course._id.toString(),
          resourceId: resource._id.toString(),
          uploadedBy: actor.id,
          originalName: safeName,
        },
      });
      uploadStream.on('error', reject);
      uploadStream.on('finish', () => resolve(uploadStream.id as mongoose.Types.ObjectId));
      uploadStream.end(file.buffer);
    });

    resource.file.gridFsId = gridFsId;

    if (file.mimetype !== 'application/pdf') {
      resource.status = ResourceStatus.READY;
    }

    await resource.save();
  } catch (err) {
    resource.status = ResourceStatus.FAILED;
    resource.ingestionError =
      err instanceof Error ? err.message : 'Failed to store uploaded resource';
    await resource.save().catch(() => undefined);
    throw new AppError(
      422,
      'RESOURCE_PROCESSING_FAILED',
      err instanceof Error ? err.message : 'Failed to store uploaded resource'
    );
  }

  if (file.mimetype === 'application/pdf') {
    const id = resource._id.toString();
    setImmediate(() => {
      void runPdfIngestionJob(id);
    });
  }

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'RESOURCE_PUBLISHED',
    targetType: 'RESOURCE',
    targetId: resource._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      title: resource.title,
      type: resource.type,
      visibility: resource.visibility,
      mimeType: resource.file.mimeType,
      size: resource.file.size,
      asyncIngestion: file.mimetype === 'application/pdf',
    },
    reqMeta,
  });

  if (resource.visibility === ResourceVisibility.COURSE) {
    await notifyCourseMembers({
      courseIds: [course._id.toString()],
      excludeUserId: actor.id,
      type: NotificationType.RESOURCE,
      title: `New material in ${course.courseCode}`,
      message: `${actor.name} uploaded "${resource.title}" (${resource.type}).`,
      link: `/courses/${course._id.toString()}?tab=notes`,
      primaryCourseId: course._id.toString(),
    });
  }

  const [dto] = await hydrateResources([resource]);
  return dto;
}

export async function retryResourceIngestion(
  actor: AuthUserContext,
  resourceId: string,
  reqMeta?: RequestMeta
): Promise<ResourceDTO> {
  if (!mongoose.isValidObjectId(resourceId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid resource ID');
  }

  const resource = await ResourceModel.findOne({
    _id: resourceId,
    deletedAt: null,
  });
  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }

  const courseId = resource.courseId.toString();
  if (actor.role !== UserRole.ADMIN) {
    const [cr, faculty] = await Promise.all([
      actor.role === UserRole.STUDENT
        ? isAssignedCR(actor.id, courseId)
        : Promise.resolve(false),
      actor.role === UserRole.FACULTY
        ? isCourseFaculty(actor.id, courseId)
        : Promise.resolve(false),
    ]);
    if (!cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have permission to re-index resources in this course'
      );
    }
  }

  if (resource.file.mimeType !== 'application/pdf') {
    throw new AppError(
      400,
      'INVALID_OPERATION',
      'Only PDF resources support text chunking and embedding ingestion'
    );
  }
  if (!resource.file.gridFsId) {
    throw new AppError(
      404,
      'FILE_MISSING',
      'Stored GridFS file could not be located for re-ingestion'
    );
  }

  resource.status = ResourceStatus.PROCESSING;
  resource.ingestionError = null;
  await resource.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'RESOURCE_INGESTION_RETRIED',
    targetType: 'RESOURCE',
    targetId: resource._id.toString(),
    metadata: { courseId, title: resource.title },
    reqMeta,
  });

  setImmediate(() => {
    void runPdfIngestionJob(resource._id.toString());
  });

  const [dto] = await hydrateResources([resource]);
  return dto;
}

export async function listCourseResources(
  viewer: AuthUserContext,
  courseId: string,
  query: ListResourcesQuery
): Promise<{ resources: ResourceDTO[]; meta: PaginationMeta }> {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const filter: Record<string, unknown> = {
    courseId: new mongoose.Types.ObjectId(courseId),
    deletedAt: null,
  };

  if (query.type) filter.type = query.type;
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    filter.$or = [{ title: rx }, { description: rx }, { 'file.originalName': rx }];
  }

  // Regular enrolled students only see READY + COURSE-visible resources
  const isStaffOrCR =
    viewer.role === UserRole.ADMIN ||
    viewer.role === UserRole.FACULTY ||
    (viewer.role === UserRole.STUDENT && (await isAssignedCR(viewer.id, courseId)));

  if (!isStaffOrCR) {
    filter.visibility = ResourceVisibility.COURSE;
    filter.status = ResourceStatus.READY;
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    ResourceModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit),
    ResourceModel.countDocuments(filter),
  ]);

  const resources = await hydrateResources(docs);
  return {
    resources,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function openAuthorizedResourceDownload(
  viewer: AuthUserContext,
  resourceId: string
): Promise<{
  resource: IResource;
  stream: GridFSBucketReadStream;
}> {
  if (!mongoose.isValidObjectId(resourceId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid resource ID');
  }

  const resource = await ResourceModel.findOne({
    _id: resourceId,
    deletedAt: null,
  });
  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }

  const courseId = resource.courseId.toString();

  if (viewer.role !== UserRole.ADMIN) {
    const [enrolled, cr, faculty] = await Promise.all([
      isEnrolled(viewer.id, courseId),
      isAssignedCR(viewer.id, courseId),
      isCourseFaculty(viewer.id, courseId),
    ]);

    if (!enrolled && !cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have access to resources in this course'
      );
    }

    if (
      resource.visibility === ResourceVisibility.PRIVATE &&
      !cr &&
      !faculty
    ) {
      throw new AppError(
        403,
        'RESOURCE_PRIVATE_FORBIDDEN',
        'This private resource is restricted to course faculty and assigned CRs'
      );
    }
  }

  if (resource.status !== ResourceStatus.READY || !resource.file.gridFsId) {
    throw new AppError(
      409,
      'RESOURCE_NOT_READY',
      'Resource file is not available for download'
    );
  }

  const bucket = getGridFSBucket();
  const stream = bucket.openDownloadStream(resource.file.gridFsId);
  return { resource, stream };
}

export async function deleteCourseResource(
  actor: AuthUserContext,
  resourceId: string,
  reqMeta?: RequestMeta
): Promise<void> {
  if (!mongoose.isValidObjectId(resourceId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid resource ID');
  }

  const resource = await ResourceModel.findOne({
    _id: resourceId,
    deletedAt: null,
  });
  if (!resource) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }

  const courseId = resource.courseId.toString();
  if (actor.role !== UserRole.ADMIN) {
    const [cr, faculty] = await Promise.all([
      actor.role === UserRole.STUDENT ? isAssignedCR(actor.id, courseId) : Promise.resolve(false),
      actor.role === UserRole.FACULTY ? isCourseFaculty(actor.id, courseId) : Promise.resolve(false),
    ]);
    if (!cr && !faculty) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have permission to delete resources in this course'
      );
    }
  }

  resource.deletedAt = new Date();
  await resource.save();

  await DocumentChunkModel.deleteMany({ resourceId: resource._id }).catch(() => undefined);

  if (resource.file.gridFsId) {
    try {
      const bucket = getGridFSBucket();
      await bucket.delete(resource.file.gridFsId);
    } catch {
      void 0;
    }
  }

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'RESOURCE_DELETED',
    targetType: 'RESOURCE',
    targetId: resource._id.toString(),
    metadata: { courseId, title: resource.title },
    reqMeta,
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
