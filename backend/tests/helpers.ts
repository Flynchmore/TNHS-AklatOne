import request from "supertest";
import { vi } from "vitest";
import type { Express } from "express";

// Fictional data only. Every account has an email now, so signing in always takes the emailed 6-digit code: tests
// put a known code on the account (only its hash is stored, as the server does) instead of reading an email.
export const MEMBER_PASSWORD = "Test-Pass-2026!";
export const TEST_CODE = "246810";

/** Signs in with password + emailed code (the code is planted, never emailed in tests). */
export async function signIn(app: Express, username: string, password: string): Promise<string> {
  const { prisma } = await import("../src/config/prisma.js");
  const { otpHash } = await import("../src/modules/auth/auth.service.js");
  const l = await request(app).post("/api/v1/auth/login").send({ username, password });
  if (l.status !== 200 || !l.body.data.requiresOtp) throw new Error(`${username} sign-in failed (${l.status}): ${JSON.stringify(l.body.data ?? l.body.message)}`);
  await prisma.user.update({ where: { username }, data: { otpCode: otpHash(TEST_CODE), otpExpiry: new Date(Date.now() + 60_000) } });
  const v = await request(app).post("/api/v1/auth/verify-login-otp").send({ username, otp: TEST_CODE });
  if (v.status !== 200) throw new Error(`${username} code check failed (${v.status})`);
  return v.body.data.token;
}

/**
 * Token of the seeded e2e_admin. Made directly (not through the sign-in screens): many test files run at once and
 * would overwrite each other's planted code on this one shared account. Sign-in itself is tested with own accounts.
 */
export async function adminToken(_app: Express): Promise<string> {
  const { prisma } = await import("../src/config/prisma.js");
  const { signToken } = await import("../src/modules/auth/auth.service.js");
  const u = await prisma.user.findUniqueOrThrow({ where: { username: "e2e_admin" }, include: { role: true } });
  return signToken({ id: u.id, username: u.username, role: u.role.name, permissions: u.role.permissions as string[] });
}

/** Creates a member through Members > Add (POST /users) and signs them in. */
export async function newMember(app: Express, username: string, extra: Record<string, unknown> = {}): Promise<{ id: string; token: string }> {
  const admin = await adminToken(app);
  const c = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
    .send({ username, password: MEMBER_PASSWORD, displayName: "Test Member", memberType: "Student", email: `${username}@example.test`, ...extra });
  if (c.status !== 201) throw new Error(`creating ${username} failed (${c.status}): ${c.body.message}`);
  return { id: c.body.data.id, token: await signIn(app, username, MEMBER_PASSWORD) };
}

/**
 * Visits are counted per Philippine day. Tests that scan "a few hours ago" would land on yesterday when run
 * just after midnight, so between 00:00 and 04:00 PH time they run with the clock (Date only) set to today's PH noon.
 * Returns the function that restores the real clock.
 */
export function avoidPhMidnight(): () => void {
  const phHour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }));
  if (phHour >= 4) return () => {};
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${day}T12:00:00+08:00`));
  return () => vi.useRealTimers();
}
