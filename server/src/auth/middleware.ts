import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import { findViewer, SESSION_COOKIE, type Viewer } from "./sessions.js";

declare global {
  // Express's own extension point for adding fields to Request
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewer: Viewer | null;
    }
  }
}

// The viewer comes only from the session cookie, never from request fields
export function sessionMiddleware(pool: Pool) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    req.viewer =
      typeof token === "string" ? await findViewer(pool, token) : null;
    next();
  };
}
