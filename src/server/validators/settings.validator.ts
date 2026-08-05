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

export const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  designation: z.string().optional().default(""),
  role: z.enum(["ACCOUNTANT", "TEACHER"]),
  presetId: z.string().optional(),
});

export const resetUserPasswordSchema = z.object({
  userId: idSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateUserCredentialsSchema = z.object({
  userId: idSchema,
  loginIdentifier: z.string().min(2, "Login ID must be at least 2 characters"),
});

export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
export type ToggleUserActiveInput = z.infer<typeof toggleUserActiveSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
export type UpdateUserCredentialsInput = z.infer<typeof updateUserCredentialsSchema>;
