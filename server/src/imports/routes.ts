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

// Checked before the upload is read, so anonymous callers cannot send files
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
        res
          .status(400)
          .json({ error: "Attach a CSV file in the 'file' field" });
        return;
      }

      try {
        // The manufacturer comes from the session only, never from the request body
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
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      res.status(413).json({ error: "The file is larger than 1 MiB" });
    } else {
      next(error);
    }
  };
  router.use(handleUploadError);

  return router;
}
