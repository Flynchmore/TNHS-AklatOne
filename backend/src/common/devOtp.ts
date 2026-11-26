import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";

/** Which app sent the current request (X-AklatOne-App header), kept for the length of the request. */
const requestApp = new AsyncLocalStorage<string>();
const LABEL: Record<string, string> = { android: "MOBILE APP", ios: "MOBILE APP", "web-mobile": "MOBILE APP (browser)", desktop: "DESKTOP APP", web: "WEB APP" };
export const appLabel = (header: string | undefined) => LABEL[header ?? ""] ?? "API";
export const trackRequestApp: RequestHandler = (req, _res, next) => requestApp.run(appLabel(req.get("x-aklatone-app")), next);

/**
 * Development only: every emailed code is also printed in the backend terminal, marked with the app that asked for it,
 * so sign-in can be tested without internet / Gmail. Never in production, never during automated tests.
 */
export function devOtp(purpose: string, username: string, code: string): string | null {
  if (env.NODE_ENV === "production" || process.env.VITEST) return null;
  const line = `[DEV OTP · ${requestApp.getStore() ?? "API"}] ${purpose} for ${username}: ${code}`;
  console.log(process.stdout.isTTY ? `\x1b[1;33m${line}\x1b[0m` : line);
  return line;
}
