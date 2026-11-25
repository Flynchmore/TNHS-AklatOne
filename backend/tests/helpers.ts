import request from "supertest";
import { vi } from "vitest";
import type { Express } from "express";

// Members are created by the librarian (self-registration was removed 2026-11-24). Fictional data only.
export const MEMBER_PASSWORD = "Test-Pass-2026!";

export async function adminToken(app: Express): Promise<string> {
  const r = await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" });
  if (r.status !== 200) throw new Error(`e2e_admin sign-in failed (${r.status})`);
  return r.body.data.token;
}

/** Creates a member through Members > Add (POST /users) and signs them in. */
export async function newMember(app: Express, username: string, extra: Record<string, unknown> = {}): Promise<{ id: string; token: string }> {
  const admin = await adminToken(app);
  const c = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
    .send({ username, password: MEMBER_PASSWORD, displayName: "Test Member", memberType: "Student", ...extra });
  if (c.status !== 201) throw new Error(`creating ${username} failed (${c.status}): ${c.body.message}`);
  const l = await request(app).post("/api/v1/auth/login").send({ username, password: MEMBER_PASSWORD });
  if (l.status !== 200) throw new Error(`${username} sign-in failed (${l.status})`);
  return { id: c.body.data.id, token: l.body.data.token };
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
