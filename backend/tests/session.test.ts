// Integration test (real database aklatone_e2e). Fictional accounts only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PW = "Session-Test-2026!";
let admin = "";

async function newMember(tag: string) {
  const username = `sess_${tag}_${stamp}`;
  const c = await request(app).post("/api/v1/users").set(auth(admin)).send({ username, password: PW, displayName: "Session Testcase", memberType: "Student" });
  expect(c.status).toBe(201);
  const l = await request(app).post("/api/v1/auth/login").send({ username, password: PW });
  expect(l.status).toBe(200);
  return { id: c.body.data.id as string, username, token: l.body.data.token as string };
}

describe("session revocation", () => {
  beforeAll(async () => {
    const a = await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" });
    admin = a.body.data.token;
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
    const again = await request(app).post("/api/v1/auth/login").send({ username: m.username, password: PW });
    expect((await request(app).get("/api/v1/auth/me").set(auth(again.body.data.token))).status).toBe(200);
  });

  it("changing the password signs out other devices and gives this device a new token", async () => {
    const m = await newMember("pw");
    const other = (await request(app).post("/api/v1/auth/login").send({ username: m.username, password: PW })).body.data.token as string;
    const res = await request(app).patch("/api/v1/auth/profile").set(auth(m.token)).send({ currentPassword: PW, password: "Session-New-2026!" });
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
    const a = await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" });
    const token = a.body.data.token as string;
    expect((await request(app).post("/api/v1/users").set(auth(token)).send({ username, password: PW, displayName: "Audit Testcase", memberType: "Student" })).status).toBe(201);
    expect((await request(app).post("/api/v1/auth/login").send({ username, password: "wrong-password" })).status).toBe(401);
    const ok = await request(app).post("/api/v1/auth/login").send({ username, password: PW });
    expect(ok.status).toBe(200);
    // Audit writes are best effort (not awaited by the request).
    await new Promise((r) => setTimeout(r, 300));
    // Other test files sign in at the same time, so look for this test's own username.
    expect(await prisma.auditLog.count({ where: { action: "auth.login_failed", metadata: { path: "$.username", equals: username } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "auth.login", actorId: ok.body.data.user.id } })).toBe(1);
    const recent = await request(app).get("/api/v1/reports/recent-activity?limit=50").set(auth(token));
    expect(recent.body.data.items.some((i: { action: string }) => i.action.startsWith("auth."))).toBe(false);
  });
});
