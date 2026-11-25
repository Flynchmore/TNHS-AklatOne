import type { RequestHandler } from "express";
import { prisma } from "../config/prisma.js";
import { fail } from "../common/response.js";
import { verifyToken } from "../modules/auth/auth.service.js";

const KEY = /^[A-Za-z0-9_-]{8,100}$/;
const KEEP_DAYS = 30;

/**
 * Writes sent with an `Idempotency-Key` header run once: a retry with the same key gets the first successful answer
 * back (header Idempotent-Replayed: true). The Desktop app sends one key per outbox item, so an upload that lost its
 * connection after the server saved the change cannot add the book, member or notice twice.
 * shortcut: two requests with the same key at the very same moment can both run; the outbox sends one at a time.
 */
export const idempotency: RequestHandler = async (req, res, next) => {
  const key = req.get("Idempotency-Key");
  if (!key || req.method === "GET") return next();
  if (!KEY.test(key)) return fail(res, 400, "Invalid Idempotency-Key");
  let userId: string;
  try {
    userId = verifyToken((req.get("Authorization") ?? "").replace(/^Bearer /, "")).id;
  } catch {
    return next(); // no valid token: the route's own authentication answers
  }
  const path = req.originalUrl.slice(0, 255);
  try {
    const prev = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (prev) {
      if (prev.userId !== userId || prev.method !== req.method || prev.path !== path) return fail(res, 422, "This Idempotency-Key was already used for a different request.");
      res.setHeader("Idempotent-Replayed", "true");
      return res.status(prev.status).type("application/json").send(prev.body);
    }
  } catch (err) {
    return next(err);
  }
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 200 || res.statusCode >= 300) return json(body);
    // Saved before the answer goes out, so a client that got the answer can always replay it.
    void prisma.idempotencyKey
      .create({ data: { key, userId, method: req.method, path, status: res.statusCode, body: JSON.stringify(body) } })
      .then(() => (Math.random() < 0.01 ? prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } }) : null))
      .catch(() => {})
      .finally(() => json(body));
    return res;
  };
  next();
};
