import { z } from "zod";
import { idSchema, paginationSchema } from "./common";

export const listUsersSchema = paginationSchema.extend({
  role: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const updateUserPermissionsSchema = z.object({
  userId: idSchema,
  permissions: z.array(
    z.object({
      permissionKey: z.string().min(1),
      allowed: z.boolean(),
    }),
  ),
});

export const toggleUserActiveSchema = z.object({
  userId: idSchema,
  isActive: z.boolean(),
});

export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
export type ToggleUserActiveInput = z.infer<typeof toggleUserActiveSchema>;
