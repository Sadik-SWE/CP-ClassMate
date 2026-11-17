import { z } from 'zod';
import { DAYS_OF_WEEK } from '../../../shared/types.ts';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const skillSchema = z.object({
  name: z.string().trim().min(1, 'Skill name is required').max(60),
  level: z.coerce.number().int().min(1).max(5),
});

export const availabilitySlotSchema = z
  .object({
    day: z.enum(DAYS_OF_WEEK),
    from: z.string().regex(timeRegex, 'Start time must be HH:MM (24h)'),
    to: z.string().regex(timeRegex, 'End time must be HH:MM (24h)'),
  })
  .refine((slot) => slot.from < slot.to, {
    message: 'End time must be after start time',
    path: ['to'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  department: z.string().trim().min(2).max(100).optional(),
  batch: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(800).optional(),
  skills: z.array(skillSchema).max(25).optional(),
  interests: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  availability: z.array(availabilitySlotSchema).max(21).optional(),
  optedOutOfMatching: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
