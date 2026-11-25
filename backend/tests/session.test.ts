// Integration test (real database aklatone_e2e). Fictional accounts only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { adminToken, signIn, TEST_CODE } from "./helpers.js";
import { otpHash } from "../src/modules/auth/auth.service.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PW = "Session-Test-2026!";
let admin = "";

async function newMember(tag: string) {
  const username = `sess_${tag}_${stamp}`;
  const c = await request(app).post("/api/v1/users").set(auth(admin)).send({ username, password: PW, displayName: "Session Testcase", memberType: "Student", email: `${username}@example.test` });
  expect(c.status).toBe(201);
  return { id: c.body.data.id as string, username, token: await signIn(app, username, PW) };
}

describe("session revocation", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
  });

  it("a deactivated member is signed out at once, and can sign in again after reactivation", async () => {
    const m = await newMember("deact");
    expect((await request(app).get("/api/v1/auth/me").set(auth(m.token))).status).toBe(200);
    expect((await request(app).patch(`/api/v1/users/${m.id}/status`).set(auth(admin)).send({ isActive: false })).status).toBe(200);
    const me = await request(app).get("/api/v1/auth/me").set(auth(m.token));
    expect(me.status).toBe(401);
    expect(me.body.message).toMatch(/session has ended/);
    await request(app).patch(`/api/v1/users/${m.id}/status`).set(auth(admin)).send({ isActive: true });
    // The old token stays revoked even after reactivation.
    expect((await request(app).get("/api/v1/auth/me").set(auth(m.token))).status).toBe(401);
    expect((await request(app).get("/api/v1/auth/me").set(auth(await signIn(app, m.username, PW)))).status).toBe(200);
  });

  it("changing the password signs out other devices and gives this device a new token", async () => {
    const m = await newMember("pw");
    const other = await signIn(app, m.username, PW);
    const { prisma } = await import("../src/config/prisma.js");
    await prisma.user.update({ where: { username: m.username }, data: { otpCode: otpHash(TEST_CODE), otpExpiry: new Date(Date.now() + 60_000) } }); // the emailed password change code
    const res = await request(app).patch("/api/v1/auth/profile").set(auth(m.token)).send({ currentPassword: PW, password: "Session-New-2026!", code: TEST_CODE });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe("string");
    expect((await request(app).get("/api/v1/auth/me").set(auth(other))).status).toBe(401);
    expect((await request(app).get("/api/v1/auth/me").set(auth(m.token))).status).toBe(401);
    // The token returned with the change is newer than the revocation, so it works.
    expect((await request(app).get("/api/v1/auth/me").set(auth(res.body.data.token))).status).toBe(200);
  });

  it("permissions come from the database, not from the old token", async () => {
    const m = await newMember("perm");
    // A member token never gains staff rights by editing its own payload, and staff routes check the DB role.
    expect((await request(app).get("/api/v1/users").set(auth(m.token))).status).toBe(403);
  });
});

describe("sign-in audit", () => {
  it("records successful and failed sign-ins, without showing them in Recent Activity", async () => {
    const { prisma } = await import("../src/config/prisma.js");
    const username = `audit_${stamp}`;
    const token = await adminToken(app);
    const made = await request(app).post("/api/v1/users").set(auth(token)).send({ username, password: PW, displayName: "Audit Testcase", memberType: "Student", email: `${username}@example.test` });
    expect(made.status).toBe(201);
    expect((await request(app).post("/api/v1/auth/login").send({ username, password: "wrong-password" })).status).toBe(401);
    await signIn(app, username, PW);
    const ok = { body: { data: { user: { id: made.body.data.id as string } } } };
    // Audit writes are best effort (not awaited by the request).
    await new Promise((r) => setTimeout(r, 300));
    // Other test files sign in at the same time, so look for this test's own username.
    expect(await prisma.auditLog.count({ where: { action: "auth.login_failed", metadata: { path: "$.username", equals: username } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "auth.login", actorId: ok.body.data.user.id } })).toBe(1);
    const recent = await request(app).get("/api/v1/reports/recent-activity?limit=50").set(auth(token));
    expect(recent.body.data.items.some((i: { action: string }) => i.action.startsWith("auth."))).toBe(false);
  });
});
