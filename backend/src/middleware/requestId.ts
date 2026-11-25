import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

const VALID_ID = /^[A-Za-z0-9._-]{1,64}$/;

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = candidate && VALID_ID.test(candidate) ? candidate : randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};