import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  about: z.string().max(200).optional(),
});

export const searchUsersSchema = z.object({
  q: z.string().min(1).max(100),
});
