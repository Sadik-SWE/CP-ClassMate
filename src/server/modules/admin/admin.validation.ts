import { z } from 'zod';
import { CourseStatus, UserRole, UserStatus } from '../../../shared/types.ts';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  search: z.string().trim().max(100).optional(),
  role: z.enum([UserRole.STUDENT, UserRole.FACULTY, UserRole.ADMIN, 'CR']).optional(),
  status: z.enum([UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.SUSPENDED]).optional(),
  department: z.string().trim().max(100).optional(),
  sortBy: z.enum(['name', 'email', 'createdAt', 'role', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const userIdParamSchema = z.object({
  userId: z.string().trim().min(1),
});

export const changeRoleSchema = z.object({
  role: z.enum([UserRole.STUDENT, UserRole.FACULTY, UserRole.ADMIN]),
});

export const changeStatusSchema = z.object({
  status: z.enum([UserStatus.PENDING, UserStatus.ACTIVE, UserStatus.SUSPENDED]),
});

export const createCourseSchema = z.object({
  courseCode: z.string().trim().min(2).max(24),
  courseName: z.string().trim().min(2).max(160),
  department: z.string().trim().min(2).max(100),
  semester: z.string().trim().min(2).max(60),
  facultyIds: z.array(z.string().trim().min(1)).default([]),
  crUserIds: z.array(z.string().trim().min(1)).default([]),
  status: z.enum([CourseStatus.ACTIVE, CourseStatus.ARCHIVED]).default(CourseStatus.ACTIVE),
});

export const updateCourseSchema = z.object({
  courseCode: z.string().trim().min(2).max(24).optional(),
  courseName: z.string().trim().min(2).max(160).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  semester: z.string().trim().min(2).max(60).optional(),
  facultyIds: z.array(z.string().trim().min(1)).optional(),
  crUserIds: z.array(z.string().trim().min(1)).optional(),
  status: z.enum([CourseStatus.ACTIVE, CourseStatus.ARCHIVED]).optional(),
});

export const assignCRSchema = z.object({
  userId: z.string().trim().min(1),
  action: z.enum(['ADD', 'REMOVE']).default('ADD'),
});

export const manageEnrollmentSchema = z.object({
  userId: z.string().trim().min(1),
  action: z.enum(['ENROLL', 'DROP']).default('ENROLL'),
});

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(80).optional(),
  actorEmail: z.string().trim().max(120).optional(),
  targetType: z.string().trim().max(60).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
