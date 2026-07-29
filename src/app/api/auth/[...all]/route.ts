import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

const handlers = toNextJsHandler(auth);

export const GET = async (req: any) => {
  try {
    console.log(`[Auth Route GET] Request URL: ${req.url}`);
    return await handlers.GET(req);
  } catch (err: any) {
    console.error("[Auth API Error GET] Exception caught in GET route handler:", {
      message: err?.message,
      name: err?.name,
      cause: err?.cause,
      stack: err?.stack || err,
    });
    return Response.json(
      {
        message: err?.message || "Internal Auth GET Error",
        code: "AUTH_API_GET_ERROR",
        stack: err?.stack,
        details: String(err),
      },
      { status: 500 }
    );
  }
};

export const POST = async (req: any) => {
  try {
    console.log(`[Auth Route POST] Request URL: ${req.url}`);
    return await handlers.POST(req);
  } catch (err: any) {
    console.error("[Auth API Error POST] Exception caught in POST route handler:", {
      message: err?.message,
      name: err?.name,
      cause: err?.cause,
      stack: err?.stack || err,
    });
    return Response.json(
      {
        message: err?.message || "Internal Auth POST Error",
        code: "AUTH_API_POST_ERROR",
        stack: err?.stack,
        details: String(err),
      },
      { status: 500 }
    );
  }
};

export const { PATCH, PUT, DELETE } = handlers;
