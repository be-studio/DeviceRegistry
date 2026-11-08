import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
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

  // Serve the built web app from the same origin. Other non-API paths get
  // index.html so client-side routes survive a reload
  if (webDir && existsSync(webDir)) {
    app.use(express.static(webDir));
    app.get(/^(?!\/(api|graphql)(\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  // Client mistakes such as malformed JSON keep their 4xx status; anything
  // else is logged and returned without details
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status >= 400 && error.status < 500) {
      res
        .status(error.status)
        .json({ error: error.expose ? error.message : "Bad request" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(handleError);

  return app;
}
