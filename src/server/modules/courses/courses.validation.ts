import { z } from 'zod';
import { CourseStatus } from '../../../shared/types.ts';

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum([CourseStatus.ACTIVE, CourseStatus.ARCHIVED]).optional(),
  department: z.string().trim().max(100).optional(),
  semester: z.string().trim().max(60).optional(),
  sortBy: z.enum(['courseCode', 'courseName', 'createdAt']).default('courseCode'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const courseIdParamSchema = z.object({
  courseId: z.string().trim().min(1),
});

export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
