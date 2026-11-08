import cookieParser from "cookie-parser";
import express from "express";
import type { Pool } from "pg";
import { sessionMiddleware } from "./auth/middleware.js";
import { createGraphQLMiddleware } from "./graphql/server.js";

export async function createApp(pool: Pool) {
  const app = express();

  app.use(cookieParser());
  app.use(sessionMiddleware(pool));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/graphql", express.json(), await createGraphQLMiddleware(pool));

  return app;
}
