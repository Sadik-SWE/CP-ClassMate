import { z } from 'zod';
import {
  PresentationAssigneeType,
  PresentationStatus,
} from '../../../shared/types.ts';

export const topicIdParamSchema = z.object({
  topicId: z.string().trim().min(1, 'Topic ID is required'),
});

export const listPresentationTopicsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum([
      PresentationStatus.ASSIGNED,
      PresentationStatus.IN_PROGRESS,
      PresentationStatus.PRESENTED,
    ])
    .optional(),
  assigneeType: z
    .enum([
      PresentationAssigneeType.COURSE,
      PresentationAssigneeType.TEAM,
      PresentationAssigneeType.STUDENT,
    ])
    .optional(),
});

export const createPresentationTopicSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
    description: z
      .string()
      .trim()
      .min(5, 'Description must be at least 5 characters')
      .max(3000),
    dueDate: z.string().trim().min(4, 'Due date is required'),
    assigneeType: z.enum([
      PresentationAssigneeType.COURSE,
      PresentationAssigneeType.TEAM,
      PresentationAssigneeType.STUDENT,
    ]),
    assigneeUserId: z.string().trim().optional().nullable(),
    assigneeLabel: z.string().trim().max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const parsedDate = new Date(data.dueDate);
    if (Number.isNaN(parsedDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Provide a valid due date',
      });
    }
    if (
      data.assigneeType === PresentationAssigneeType.STUDENT &&
      !data.assigneeUserId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assigneeUserId'],
        message: 'Select a student when assigning directly to a student',
      });
    }
    if (
      data.assigneeType === PresentationAssigneeType.TEAM &&
      !data.assigneeLabel?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assigneeLabel'],
        message: 'Provide a team name or group label for team assignments',
      });
    }
  });

export const coordinatePresentationTopicSchema = z.object({
  coordinationNotes: z.string().trim().max(1500).default(''),
  presentationSlot: z.string().trim().max(160).default(''),
});

export const updatePresentationProgressSchema = z.object({
  status: z.enum([
    PresentationStatus.ASSIGNED,
    PresentationStatus.IN_PROGRESS,
    PresentationStatus.PRESENTED,
  ]),
  facultyNotes: z.string().trim().max(1500).default(''),
});

export type ListPresentationTopicsQuery = z.infer<
  typeof listPresentationTopicsQuerySchema
>;
export type CreatePresentationTopicInput = z.infer<
  typeof createPresentationTopicSchema
>;
export type CoordinatePresentationTopicInput = z.infer<
  typeof coordinatePresentationTopicSchema
>;
export type UpdatePresentationProgressInput = z.infer<
  typeof updatePresentationProgressSchema
>;
