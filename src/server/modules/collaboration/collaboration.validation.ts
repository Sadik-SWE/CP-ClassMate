import { z } from 'zod';
import {
  DAYS_OF_WEEK,
  MatchCandidateActionStatus,
} from '../../../shared/types.ts';

const timeHHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const availabilitySlotSchema = z
  .object({
    day: z.enum(DAYS_OF_WEEK),
    from: z.string().regex(timeHHMM, 'Time must be HH:MM'),
    to: z.string().regex(timeHHMM, 'Time must be HH:MM'),
  })
  .refine((s) => s.from < s.to, {
    message: 'End time must be after start time',
  });

export const teamIdParamSchema = z.object({
  teamId: z.string().trim().min(1, 'Team ID is required'),
});

export const requestIdParamSchema = z.object({
  requestId: z.string().trim().min(1, 'Request ID is required'),
});

export const matchRequestCandidateParamsSchema = z.object({
  requestId: z.string().trim().min(1, 'Match request ID is required'),
  candidateId: z.string().trim().min(1, 'Candidate ID is required'),
});

export const discoverClassmatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  courseId: z.string().trim().optional(),
  search: z.string().trim().max(120).optional(),
  skill: z.string().trim().max(60).optional(),
  day: z.enum(DAYS_OF_WEEK).optional(),
});

export const listTeamsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  courseId: z.string().trim().optional(),
  mineOnly: z.coerce.boolean().optional(),
});

export const createTeamSchema = z.object({
  courseId: z.string().trim().min(1, 'Course ID is required'),
  name: z.string().trim().min(3, 'Team name must be at least 3 characters').max(120),
  description: z.string().trim().max(1000).default(''),
  maxSize: z.coerce.number().int().min(2).max(10).default(4),
});

export const inviteToTeamSchema = z.object({
  targetUserId: z.string().trim().min(1, 'Select a classmate to invite'),
  message: z.string().trim().max(500).default(''),
});

export const joinTeamRequestSchema = z.object({
  message: z.string().trim().max(500).default(''),
});

export const respondTeamRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT', 'CANCEL']),
});

export const createMatchRequestSchema = z.object({
  courseId: z.string().trim().min(1, 'Course is required'),
  teamId: z.string().trim().optional().nullable(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  description: z
    .string()
    .trim()
    .min(10, 'Describe project scope (at least 10 characters)')
    .max(2000),
  requiredSkills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        importance: z.coerce.number().int().min(1).max(5),
      })
    )
    .min(1, 'Add at least one required skill')
    .max(12),
  desiredTeamSize: z.coerce.number().int().min(2).max(10).default(4),
  timeConstraints: z.array(availabilitySlotSchema).max(14).default([]),
  optionalInterests: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  hardConstraints: z
    .object({
      strictTimeOverlap: z.boolean().default(false),
      sameBatchOnly: z.boolean().default(false),
      minSkillLevel: z.coerce.number().int().min(0).max(5).default(0),
      requiredDays: z.array(z.enum(DAYS_OF_WEEK)).max(7).default([]),
    })
    .default({
      strictTimeOverlap: false,
      sameBatchOnly: false,
      minSkillLevel: 0,
      requiredDays: [],
    }),
});

export const updateMatchCandidateActionSchema = z.object({
  action: z.enum([
    MatchCandidateActionStatus.INVITED,
    MatchCandidateActionStatus.DISMISSED,
  ]),
  teamId: z.string().trim().optional().nullable(),
  message: z.string().trim().max(500).optional(),
});

export type DiscoverClassmatesQuery = z.infer<
  typeof discoverClassmatesQuerySchema
>;
export type ListTeamsQuery = z.infer<typeof listTeamsQuerySchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type InviteToTeamInput = z.infer<typeof inviteToTeamSchema>;
export type JoinTeamRequestInput = z.infer<typeof joinTeamRequestSchema>;
export type RespondTeamRequestInput = z.infer<typeof respondTeamRequestSchema>;
export type CreateMatchRequestInput = z.infer<typeof createMatchRequestSchema>;
export type UpdateMatchCandidateActionInput = z.infer<
  typeof updateMatchCandidateActionSchema
>;
