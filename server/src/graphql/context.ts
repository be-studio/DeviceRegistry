import type { Request, Response } from "express";
import type { Pool } from "pg";
import type { Viewer } from "../auth/sessions.js";

export interface Context {
  pool: Pool;
  viewer: Viewer | null;
  req: Request;
  res: Response;
}
