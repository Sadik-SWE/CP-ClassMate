import { z } from 'zod';
import { UserRole } from '../../../shared/types.ts';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Valid university email is required').max(160),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  department: z.string().trim().min(2, 'Department is required').max(100),
  batch: z.string().trim().max(40).optional(),
  studentId: z.string().trim().max(40).optional(),
  role: z.string().optional(),
  accountType: z.enum([UserRole.STUDENT, UserRole.FACULTY]).default(UserRole.STUDENT),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required').max(160),
  password: z.string().min(1, 'Password is required').max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid email is required').max(160),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, 'Invalid reset token').max(256),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
