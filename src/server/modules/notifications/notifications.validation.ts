import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const notificationIdParamSchema = z.object({
  notificationId: z.string().trim().min(1),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
