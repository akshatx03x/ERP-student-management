/**
 * Extracts a friendly actionable error message on the client side.
 * Intercepts Next.js production redaction strings (e.g. "Server omitted an error...",
 * "An error occurred in the Server Components render. The specific message is omitted in production...")
 * and provides a safe fallback instead.
 */
export function getFriendlyErrorMessage(err: unknown, fallback = "Unable to complete this action. Please try again."): string {
  if (!err) return fallback;

  let msg = "";
  if (typeof err === "string") {
    msg = err;
  } else if (typeof err === "object" && err !== null) {
    if ("error" in err && typeof (err as any).error === "string") {
      msg = (err as any).error;
    } else if ("message" in err && typeof (err as any).message === "string") {
      msg = (err as any).message;
    }
  }

  if (!msg) return fallback;

  const isNextProductionRedaction =
    msg.includes("Server Components render") ||
    msg.includes("omitted in production") ||
    msg.includes("Server omitted an error") ||
    msg.includes("digest property may be included");

  if (isNextProductionRedaction) {
    return fallback;
  }

  // Hide raw technical error messages
  const isTechnical =
    msg.includes("PrismaClient") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("node_modules") ||
    msg.includes("at ");

  if (isTechnical) {
    return fallback;
  }

  return msg;
}
