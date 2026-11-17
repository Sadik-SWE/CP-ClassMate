import { z } from 'zod';
import {
  AnnouncementScope,
  AnnouncementStatus,
} from '../../../shared/types.ts';

export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(180),
    content: z.string().trim().min(2, 'Content is required').max(5000),
    scope: z
      .enum([AnnouncementScope.COURSE, AnnouncementScope.ALL_ENROLLED])
      .default(AnnouncementScope.COURSE),
    courseId: z.string().trim().optional().nullable(),
    pinned: z.boolean().default(false),
  })
  .refine(
    (data) =>
      data.scope !== AnnouncementScope.COURSE ||
      (typeof data.courseId === 'string' && data.courseId.length > 0),
    {
      message: 'courseId is required when targeting a specific course',
      path: ['courseId'],
    }
  );

export const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  content: z.string().trim().min(2).max(5000).optional(),
  pinned: z.boolean().optional(),
});

export const listAnnouncementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  courseId: z.string().trim().optional(),
  pinned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  status: z
    .enum([AnnouncementStatus.PUBLISHED, AnnouncementStatus.WITHDRAWN])
    .optional(),
  includeWithdrawn: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().trim().max(100).optional(),
});

export const announcementIdParamSchema = z.object({
  announcementId: z.string().trim().min(1),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
