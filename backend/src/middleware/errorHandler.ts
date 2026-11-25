import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

import { env } from "../config/env.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, requestId: req.id });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, message: "Validation failed", errors: err.flatten(), requestId: req.id });
  }

  if (err?.code === "P2002") {
    return res.status(409).json({ success: false, message: "Resource already exists", requestId: req.id });
  }
  if (err?.code === "P2003") {
    return res.status(409).json({ success: false, message: "Operation conflicts with related records", requestId: req.id });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({ success: false, message: "Record not found", requestId: req.id });
  }

  const status = typeof err?.status === "number" ? err.status : 500;
  const message =
    status >= 500 && env.NODE_ENV === "production"
      ? "Internal server error"
      : err?.message ?? "Internal server error";

  if (status >= 500) {
    logger.error({ err, path: req.originalUrl }, "Unhandled error");
  }

  return res.status(status).json({ success: false, message, requestId: req.id });
};