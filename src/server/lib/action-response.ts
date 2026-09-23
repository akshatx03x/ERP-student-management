import { Prisma } from "@prisma/client";

export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ActionResult<T = any> =
  | { success: true; data: T; error?: null; code?: undefined }
  | { success: false; data?: null; error: string; code?: string };

export class AppError extends Error {
  public code: string;
  public isUserFacing = true;

  constructor(message: string, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/**
 * Sanitizes errors so that expected business rules and validation errors
 * keep their friendly actionable message in both dev and production,
 * while unexpected crashes and raw database/system stack traces are safely masked.
 */
export function sanitizeError(err: unknown, fallbackMessage = "Something went wrong. Please try again."): {
  message: string;
  code: string;
} {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code };
  }

  const errCode = (err as any)?.code;
  if (errCode === "P2002" || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
    const metaTarget = (err as any)?.meta?.target;
    const target = Array.isArray(metaTarget) ? metaTarget.join(", ") : (typeof metaTarget === "string" ? metaTarget : "record");
    return {
      message: `A conflict occurred: A ${target} with this unique information already exists.`,
      code: "UNIQUE_CONSTRAINT_VIOLATION",
    };
  }
  if (errCode === "P2025" || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) {
    return {
      message: "The requested record was not found or has already been removed.",
      code: "NOT_FOUND",
    };
  }
  if (errCode === "P2003" || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")) {
    return {
      message: "Cannot complete operation because related records depend on this entry.",
      code: "FOREIGN_KEY_VIOLATION",
    };
  }

  if (err instanceof Error) {
    const msg = err.message || "";

    // Known user-facing business rules or validation errors thrown in services
    const isKnownBusinessRule =
      msg.includes("already exists") ||
      msg.includes("Transfer Certificate") ||
      msg.includes("exceeds the 5 MB limit") ||
      msg.includes("exceeds maximum size") ||
      msg.includes("Image upload failed") ||
      msg.includes("File exceeds") ||
      msg.includes("Only Draft certificates") ||
      msg.includes("Only Issued certificates") ||
      msg.includes("Student not found") ||
      msg.includes("Family not found") ||
      msg.includes("FORBIDDEN") ||
      msg.includes("Invalid session") ||
      msg.includes("Validation failed") ||
      msg.includes("must be greater than zero") ||
      msg.includes("is required") ||
      msg.includes("Student enrollment record not found");

    if (isKnownBusinessRule) {
      let code = "BUSINESS_RULE_ERROR";
      if (msg.includes("Transfer Certificate") && msg.includes("already exists")) {
        code = "DUPLICATE_TC_DRAFT";
      } else if (msg.includes("5 MB") || msg.includes("maximum size")) {
        code = "FILE_TOO_LARGE";
      } else if (msg.includes("FORBIDDEN")) {
        code = "FORBIDDEN";
      }
      return { message: msg, code };
    }

    // Do NOT expose raw stack traces, internal paths, or technical errors
    const isTechnicalError =
      err instanceof TypeError ||
      err instanceof ReferenceError ||
      err instanceof SyntaxError ||
      msg.includes("Cannot read properties") ||
      msg.includes("is not a function") ||
      msg.includes("is not defined") ||
      msg.includes("PrismaClient") ||
      msg.includes("Connection") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("syntax error") ||
      msg.includes("stack") ||
      msg.includes("node_modules");

    if (!isTechnicalError && msg.length > 0 && msg.length < 160 && !msg.includes("\n")) {
      return { message: msg, code: "OPERATION_FAILED" };
    }
  }

  return { message: fallbackMessage, code: "INTERNAL_ERROR" };
}

/**
 * Wraps any Server Action function, ensuring any error is caught, logged internally,
 * and returned as a structured ActionResult rather than throwing unhandled across the
 * Next.js production boundary (which would cause Next.js to mask the message).
 */
export async function safeAction<T>(
  actionName: string,
  fn: () => Promise<T>,
  fallbackMessage = "Something went wrong. Please try again.",
): Promise<ActionResult<T> & (T extends object ? T : {})> {
  try {
    const data = await fn();
    return {
      success: true,
      data,
      ...(typeof data === "object" && data !== null ? (data as any) : {}),
    };
  } catch (err: unknown) {
    console.error(`[ServerAction:${actionName}] Error:`, err);
    const sanitized = sanitizeError(err, fallbackMessage);
    return {
      success: false,
      data: null as any,
      error: sanitized.message,
      code: sanitized.code,
    } as any;
  }
}
