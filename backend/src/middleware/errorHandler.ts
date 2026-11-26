import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

import { env } from "../config/env.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, message: "This page or action was not found.", requestId: req.id });
};

/**
 * One readable sentence for a form error: the rule's own message when it has one (e.g. "Grade & section: use the
 * format 10 - Archimedes"), otherwise "Please check <field>." instead of a technical validation report.
 */
export function friendlyZodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Please check the details and try again.";
  if (!/^(Invalid|Too (small|big)|Expected|Required|Unrecognized)/i.test(first.message)) return first.message;
  const field = first.path.map(String).filter(p => !/^\d+$/.test(p)).pop() ?? "";
  const words = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Id\b/, "").toLowerCase().trim();
  return words ? `Please check the ${words} and try again.` : "Please check the details and try again.";
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, message: friendlyZodMessage(err), errors: err.flatten(), requestId: req.id });
  }

  if (err?.code === "P2002") {
    return res.status(409).json({ success: false, message: "This record already exists.", requestId: req.id });
  }
  if (err?.code === "P2003") {
    return res.status(409).json({ success: false, message: "This record is still used by other records, so it cannot be changed this way.", requestId: req.id });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({ success: false, message: "Not found. It may have been removed already.", requestId: req.id });
  }

  const status = typeof err?.status === "number" ? err.status : 500;
  const message =
    status >= 500 && env.NODE_ENV === "production"
      ? "Something went wrong in AklatOne. Please try again in a moment."
      : err?.message ?? "Something went wrong in AklatOne. Please try again in a moment.";

  if (status >= 500) {
    logger.error({ err, path: req.originalUrl }, "Unhandled error");
  }

  return res.status(status).json({ success: false, message, requestId: req.id });
};