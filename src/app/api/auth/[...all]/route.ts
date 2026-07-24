import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

const handlers = toNextJsHandler(auth);

export const GET = async (req: any) => {
  try {
    return await handlers.GET(req);
  } catch (err: any) {
    console.error("[Auth API Error GET]", err?.stack || err);
    throw err;
  }
};

export const POST = async (req: any) => {
  try {
    return await handlers.POST(req);
  } catch (err: any) {
    console.error("[Auth API Error POST]", err?.stack || err);
    throw err;
  }
};

export const { PATCH, PUT, DELETE } = handlers;
