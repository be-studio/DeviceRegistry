import {
  Router,
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response
} from "express";
import multer from "multer";
import type { Pool } from "pg";
import { importDevices } from "./importService.js";
import { FileError, MAX_FILE_BYTES } from "./parseCsv.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES }
});

const FILE_FIELD_MESSAGE = "Attach a CSV file in the 'file' field";

// Runs before multer, so uploads from callers who may not import are never read into memory
function requireManufacturer(req: Request, res: Response, next: NextFunction) {
  if (!req.viewer) {
    res.status(401).json({ error: "Sign in to upload devices" });
  } else if (req.viewer.role !== "manufacturer") {
    res.status(403).json({ error: "Only manufacturers can upload devices" });
  } else {
    next();
  }
}

export function importRouter(pool: Pool) {
  const router = Router();

  router.post(
    "/",
    requireManufacturer,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) {
        res.status(400).json({ error: FILE_FIELD_MESSAGE });
        return;
      }

      try {
        // The manufacturer comes from the session only, never from the request body.
        // requireManufacturer has run, and the database gives every manufacturer
        // user a manufacturer, so neither value is null here
        const result = await importDevices(
          pool,
          req.viewer!.manufacturerId!,
          req.file.buffer
        );
        res.status(result.status === "accepted" ? 200 : 422).json(result);
      } catch (error) {
        if (error instanceof FileError) {
          res.status(400).json({ error: error.message });
          return;
        }
        throw error;
      }
    }
  );

  const handleUploadError: ErrorRequestHandler = (error, _req, res, next) => {
    if (!(error instanceof multer.MulterError)) {
      next(error);
    } else if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MiB`
      });
    } else {
      res.status(400).json({ error: FILE_FIELD_MESSAGE });
    }
  };
  router.use(handleUploadError);

  return router;
}
