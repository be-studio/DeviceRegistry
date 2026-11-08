import cookieParser from "cookie-parser";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { sessionMiddleware } from "./auth/middleware.js";
import { createGraphQLMiddleware } from "./graphql/server.js";
import { importRouter } from "./imports/routes.js";

export async function createApp(pool: Pool, webDir?: string) {
  const app = express();

  app.use(cookieParser());
  app.use(sessionMiddleware(pool));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/imports", importRouter(pool));

  app.use("/graphql", express.json(), await createGraphQLMiddleware(pool));

  // Serve the built SPA from the same origin, falling back to index.html for client-side routes
  if (webDir && existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/(api|graphql)(\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  return app;
}
