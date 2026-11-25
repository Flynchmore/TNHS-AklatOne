import type { RequestHandler } from "express";
import { verifyToken } from "../modules/auth/auth.service.js";
import { fail } from "../common/response.js";
import { loadSession } from "./session.js";

export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return fail(res, 401, "Missing or invalid authorization header");
  }
  let claims;
  try {
    claims = verifyToken(header.slice(7));
  } catch {
    return fail(res, 401, "Invalid or expired token");
  }
  try {
    const user = await loadSession(claims);
    if (!user) return fail(res, 401, "Your session has ended. Please sign in again.");
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

export function requirePermission(permission: string): RequestHandler {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, "Unauthenticated");
    if (!req.user.permissions.includes(permission) && req.user.role !== "ADMIN") {
      return fail(res, 403, "Forbidden");
    }
    next();
  };
}