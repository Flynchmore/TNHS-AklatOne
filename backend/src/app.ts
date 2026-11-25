import "./common/types.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { FallbackStore } from "./config/redis.js";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { sessionsRouter } from "./modules/auth/sessions.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { bookCopiesRouter } from "./modules/book-copies/bookCopies.routes.js";
import { circulationRouter } from "./modules/circulation/circulation.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { borrowRequestsRouter } from "./modules/borrow-requests/borrowRequests.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { setupRouter } from "./modules/setup/setup.routes.js";
import { favouritesRouter } from "./modules/favourites/favourites.routes.js";
import { openApiSpec } from "./config/openapi.js";
import { ok, fail } from "./common/response.js";
import { backupRouter } from "./modules/backup/backup.routes.js";
import { idempotency } from "./middleware/idempotency.js";
import { systemRouter } from "./modules/system/system.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { visitsRouter } from "./modules/visits/visits.routes.js";
import { timeRouter } from "./modules/time/time.routes.js";
import { suggestionsRouter } from "./modules/suggestions/suggestions.routes.js";
import { isRestoring } from "./modules/backup/backup.service.js";
import { verifyToken } from "./modules/auth/auth.service.js";

// Signed-in account calls: counted per account by the global limiter, never per school IP.
const SESSION_PATHS = /^\/api\/v1\/auth\/(me|profile|sessions(\/.*)?)$/;
// Password and code checks: only FAILED attempts count, per account (IP + username).
// Password checks: sign-in, and leaving the Visitor's Log kiosk (asks the librarian's password).
const CREDENTIAL_PATHS = /^\/api\/v1\/(auth\/(login|verify-login-otp)|visits\/kiosk\/exit)$/;
export const MAX_FAILED_SIGNINS = 5;
const pathOf = (req: { originalUrl: string }) => req.originalUrl.split("?")[0] ?? "";

/** Origins of the packaged Member Mobile (Capacitor) and Staff Desktop (Tauri) apps; always allowed. */
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const APP_ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

export function createApp() {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(helmet());
  // Expose the rate-limit headers so sign-in screens can show "N attempts left".
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);
  app.use(cors({
    // Always: the phone / desktop apps and CORS_ORIGINS. Outside production also this computer and the local network
    // (Vite dev server, phones on the school Wi-Fi). Production behind nginx is same-origin and needs nothing more.
    origin: [...env.CORS_ORIGINS, ...APP_ORIGINS, ...(env.NODE_ENV === "production" ? [] : [DEV_ORIGIN])],
    exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
  }));
  app.use(express.json({ limit: "1mb" }));

  // Rate-limit counters live in Redis when it is reachable and in memory otherwise (see config/redis.ts).
  // Each limiter needs its own key prefix, otherwise their counters add up in the same Redis key.
  const store = (prefix: string) => ({ store: new FallbackStore(prefix) });

  // A whole school can share one public IP (school Wi-Fi), so signed-in requests are counted per account and only
  // requests without a valid token are counted per IP, with a limit sized for a full school.
  const signedInUser = (req: express.Request) => {
    const h = req.headers.authorization;
    if (!h?.startsWith("Bearer ")) return null;
    try { return verifyToken(h.slice(7)); } catch { return null; }
  };
  const globalLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    // Staff send many requests in a row (Desktop upload of an offline outbox, adding members), members far fewer.
    limit: (req) => { const u = signedInUser(req); return !u ? env.ANON_RATE_LIMIT_MAX : u.role === "MEMBER" ? env.GLOBAL_RATE_LIMIT_MAX : env.STAFF_RATE_LIMIT_MAX; },
    keyGenerator: (req) => { const u = signedInUser(req); return u ? `u:${u.id}` : `ip:${ipKeyGenerator(req.ip ?? "")}`; },
    standardHeaders: true,
    legacyHeaders: false,
    // Credential endpoints use the limiters below; signed-in session calls (/me, /profile) use this one.
    skip: (req) => req.path.startsWith("/api/v1/auth") && !SESSION_PATHS.test(req.path),
    ...store("rl:global:"),
  });
  app.use(globalLimiter);

  // Other credential endpoints (forgot/reset password, first-run setup).
  const authLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please wait a few minutes and try again." },
    // Per IP + email, so students resetting passwords on the same school Wi-Fi do not block each other.
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.email ?? "").trim().toLowerCase()}`,
    skip: (req) => SESSION_PATHS.test(pathOf(req)) || CREDENTIAL_PATHS.test(pathOf(req)) || (req.method === "GET" && pathOf(req) === "/api/v1/setup/status"),
    ...store("rl:auth:"),
  });

  const loginLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: MAX_FAILED_SIGNINS,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.username ?? "").trim().toLowerCase()}`,
    message: { success: false, message: `Too many failed sign-in attempts for this account. Please wait ${Math.round(env.RATE_LIMIT_WINDOW_MS / 60000)} minutes and try again.` },
    skip: (req) => !CREDENTIAL_PATHS.test(pathOf(req)),
    ...store("rl:login:"),
  });

  // Wrong password-reset codes per email address (any IP): an attacker with many IPs still gets only a few guesses
  // at the 6-digit code while it is valid (10 minutes). Correct codes never count.
  const resetCodeLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `reset:${String(req.body?.email ?? req.body?.phone ?? "").trim().toLowerCase()}`,
    message: { success: false, message: "Too many wrong codes for this account. Please wait a few minutes, then ask for a new code." },
    skip: (req) => !/^\/api\/v1\/auth\/(verify-otp|reset-password)$/.test(pathOf(req)),
    ...store("rl:reset:"),
  });

  app.use((req, _res, next) => {
    logger.debug({ requestId: req.id, method: req.method, url: req.originalUrl }, "request");
    next();
  });

  app.get("/health", (_req, res) => {
    ok(res, { status: isRestoring() ? "restoring" : "ok", env: env.NODE_ENV }, "Healthy");
  });

  // While a database restore runs, nothing may read or write half-restored data.
  app.use("/api/v1", (_req, res, next) => (isRestoring() ? fail(res, 503, "The library database is being restored. Please try again in a minute.") : next()));

  const api = express.Router();
  api.use(idempotency);
  // Signed-in devices: per-account limits only (see SESSION_PATHS); mounted before /auth so the sign-in limiters skip it.
  api.use("/auth/sessions", sessionsRouter);
  api.use("/auth", authLimiter, loginLimiter, resetCodeLimiter, authRouter);
  api.use("/users", usersRouter);
  api.use("/catalog", catalogRouter);
  api.use("/categories", categoriesRouter);
  api.use("/book-copies", bookCopiesRouter);
  api.use("/circulation", circulationRouter);
  api.use("/reports", reportsRouter);
  api.use("/borrow-requests", borrowRequestsRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/favourites", favouritesRouter);
  api.use("/setup", authLimiter, setupRouter);
  api.use("/backup", backupRouter);
  api.use("/system", systemRouter);
  api.use("/inventory", inventoryRouter);
  api.use("/visits", loginLimiter, visitsRouter);
  api.use("/time", timeRouter);
  api.use("/suggestions", suggestionsRouter);
  app.use("/api/v1", api);

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}