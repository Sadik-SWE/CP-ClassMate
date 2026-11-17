import { z } from 'zod';
import { ResourceType, ResourceVisibility } from '../../../shared/types.ts';

export const uploadResourceSchema = z.object({
  title: z.string().trim().min(2, 'Resource title is required').max(180),
  description: z.string().trim().max(1000).default(''),
  type: z
    .enum([
      ResourceType.NOTES,
      ResourceType.SLIDES,
      ResourceType.REFERENCE,
      ResourceType.ASSIGNMENT,
      ResourceType.OTHER,
    ])
    .default(ResourceType.NOTES),
  visibility: z
    .enum([ResourceVisibility.COURSE, ResourceVisibility.PRIVATE])
    .default(ResourceVisibility.COURSE),
});

export const listResourcesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  type: z
    .enum([
      ResourceType.NOTES,
      ResourceType.SLIDES,
      ResourceType.REFERENCE,
      ResourceType.ASSIGNMENT,
      ResourceType.OTHER,
    ])
    .optional(),
  search: z.string().trim().max(100).optional(),
});

export const resourceIdParamSchema = z.object({
  resourceId: z.string().trim().min(1),
});

export type UploadResourceInput = z.infer<typeof uploadResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
