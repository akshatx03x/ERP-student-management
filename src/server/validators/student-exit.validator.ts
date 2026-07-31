import { ExitReason } from "@prisma/client";
import { z } from "zod";
import { dateSchema, idSchema, optionalDateSchema } from "./common";

export const createStudentExitSchema = z.object({
  studentId: idSchema,
  leavingDate: dateSchema,
  reason: z.nativeEnum(ExitReason),
  tcNumber: z.string().trim().optional().nullable(),
  tcDate: optionalDateSchema,
  remarks: z.string().trim().optional().nullable(),
});

export type CreateStudentExitInput = z.infer<typeof createStudentExitSchema>;
