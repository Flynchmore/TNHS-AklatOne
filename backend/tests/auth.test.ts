import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { env } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, MEMBER_PASSWORD, newMember, signIn, TEST_CODE } from "./helpers.js";
import { otpHash } from "../src/modules/auth/auth.service.js";

describe("auth", () => {
  const app = createApp();
  const username = `testuser_${Date.now()}`;

  it("has no Google sign-in; registration needs every required detail", async () => {
    expect((await request(app).post("/api/v1/auth/google").send({ idToken: "x" })).status).toBe(404);
    expect((await request(app).post("/api/v1/auth/register").send({ username: "x_self", password: "Test-Pass-2026!" })).status).toBe(400);
    await newMember(app, username);
  });

  it("a correct password alone never signs in: the emailed code does", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ username, password: "Test-Pass-2026!" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ requiresOtp: true });
    expect(res.body.data.token).toBeUndefined();
    expect(await signIn(app, username, "Test-Pass-2026!")).toBeTruthy();
  });

  it("returns current user with token", async () => {
    const token = await signIn(app, username, "Test-Pass-2026!");
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(username);
    expect(res.body.data.role).toBe("MEMBER");
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
  });

  it("saves and returns the member's profile details; blank clears a field", async () => {
    const token = await signIn(app, username, "Test-Pass-2026!");
    const auth = { Authorization: `Bearer ${token}` };
    const upd = await request(app).patch("/api/v1/auth/profile").set(auth).send({ displayName: "Juana Testcase", memberType: "Student", gradeSection: "Grade 10 - Sampaguita", hobbies: "Reading, chess" });
    expect(upd.status).toBe(200);
    let me = (await request(app).get("/api/v1/auth/me").set(auth)).body.data;
    expect(me).toMatchObject({ displayName: "Juana Testcase", gradeSection: "Grade 10 - Sampaguita", hobbies: "Reading, chess" });
    await request(app).patch("/api/v1/auth/profile").set(auth).send({ hobbies: "" });
    me = (await request(app).get("/api/v1/auth/me").set(auth)).body.data;
    expect(me.hobbies).toBeNull();
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ hobbies: "x".repeat(301) })).status).toBe(400);
    await request(app).patch("/api/v1/auth/profile").set(auth).send({ gender: "Female", studentRowNo: 23 });
    me = (await request(app).get("/api/v1/auth/me").set(auth)).body.data;
    expect(me).toMatchObject({ gender: "Female", studentRowNo: 23 });
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ gender: "Other text" })).status).toBe(400);
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ studentRowNo: 0 })).status).toBe(400);
    // A cropped 256x256 JPEG is ~30-60 KB as a data URL; it must fit the avatar column.
    const photo = `data:image/jpeg;base64,${"A".repeat(60000)}`;
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ avatarUrl: photo })).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set(auth)).body.data.avatarUrl).toBe(photo);
    // A fresh sign-in returns the saved photo too (it used to appear only after a refresh).
    await request(app).post("/api/v1/auth/login").send({ username, password: "Test-Pass-2026!" });
    await prisma.user.update({ where: { username }, data: { otpCode: otpHash(TEST_CODE), otpExpiry: new Date(Date.now() + 60_000) } });
    const again = await request(app).post("/api/v1/auth/verify-login-otp").send({ username, otp: TEST_CODE });
    expect(again.body.data.user).toMatchObject({ avatarUrl: photo, displayName: "Juana Testcase", role: "MEMBER" });
  });

  it("does not count /me against the strict sign-in rate limit", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({ username, password: "Test-Pass-2026!" });
    const strict = login.headers["ratelimit-limit"];
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${await signIn(app, username, "Test-Pass-2026!")}`);
    expect(me.headers["ratelimit-limit"]).toBeDefined();
    expect(me.headers["ratelimit-limit"]).not.toBe(strict);
  });

  it("allows 5 failed sign-ins per account, never counts successful ones, then locks only that account", async () => {
    const fresh = createApp();
    const user = `limit_${Date.now()}`;
    await newMember(app, user);
    for (let i = 0; i < 6; i++) expect((await request(fresh).post("/api/v1/auth/login").send({ username: user, password: "Test-Pass-2026!" })).status).toBe(200);
    const remaining: string[] = [];
    for (let i = 0; i < 5; i++) {
      const bad = await request(fresh).post("/api/v1/auth/login").send({ username: user, password: "wrong-password" });
      expect(bad.status).toBe(401);
      remaining.push(String(bad.headers["ratelimit-remaining"]));
    }
    expect(remaining).toEqual(["4", "3", "2", "1", "0"]);
    const locked = await request(fresh).post("/api/v1/auth/login").send({ username: user, password: "Test-Pass-2026!" });
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/failed sign-in attempts/);
    expect((await request(fresh).post("/api/v1/auth/login").send({ username: username, password: "Test-Pass-2026!" })).status).toBe(200);
  });

  it("rejects a second member with the same email or a weak password", async () => {
    const email = `dup_${Date.now()}@example.test`;
    await newMember(app, `dupa_${Date.now()}`, { email });
    await expect(newMember(app, `dupb_${Date.now()}`, { email })).rejects.toThrow(/409/);
    await expect(newMember(app, `weak_${Date.now()}`, { password: "password123" })).rejects.toThrow(/400/);
  });

  it("changing the password needs the current one and a strong new one; photos must be real images", async () => {
    const user = `pwchange_${Date.now()}`;
    let auth = { Authorization: `Bearer ${(await newMember(app, user)).token}` };
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ password: "New-Pass-2026!!" })).status).toBe(400);
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ password: "New-Pass-2026!!", currentPassword: "wrong-password" })).status).toBe(400);
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ password: "weakpass", currentPassword: "Test-Pass-2026!" })).status).toBe(400);
    await prisma.user.update({ where: { username: user }, data: { otpCode: otpHash(TEST_CODE), otpExpiry: new Date(Date.now() + 60_000) } }); // emailed password change code
    const changed = await request(app).patch("/api/v1/auth/profile").set(auth).send({ password: "New-Pass-2026!!", currentPassword: "Test-Pass-2026!", code: TEST_CODE });
    expect(changed.status).toBe(200);
    // The old token is revoked by the change; the response carries a new one.
    expect((await request(app).get("/api/v1/auth/me").set(auth)).status).toBe(401);
    auth = { Authorization: `Bearer ${changed.body.data.token}` };
    expect((await request(app).post("/api/v1/auth/login").send({ username: user, password: "New-Pass-2026!!" })).status).toBe(200);
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ avatarUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).patch("/api/v1/auth/profile").set(auth).send({ avatarUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" })).status).toBe(200);
  });

  it("forgot password never reveals whether an email has an account, and stores only a hash of the code", async () => {
    const app = createApp();
    const stamp = Date.now();
    const email = `reset_${stamp}@example.com`;
    const admin = await adminToken(app);
    const made = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
      .send({ username: `reset_${stamp}`, password: MEMBER_PASSWORD, displayName: "Reset Tester", memberType: "Student", email });
    expect(made.status).toBe(201);
    const known = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: `nobody_${stamp}@example.com` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
    expect(unknown.body.data).toEqual(known.body.data);
    const stored = (await prisma.user.findUnique({ where: { id: made.body.data.id } }))!.otpCode!;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect((await request(app).post("/api/v1/auth/verify-otp").send({ email, otp: "000000" })).status).toBe(400);
  });

  it("an unknown username takes as long as a wrong password, and the code screen shows only a hint of the email", async () => {
    const app = createApp();
    const stamp = Date.now();
    const admin = await adminToken(app);
    await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`)
      .send({ username: `hint_${stamp}`, password: MEMBER_PASSWORD, displayName: "Hint Tester", memberType: "Student", email: `hint_${stamp}@example.com` });
    const time = async (username: string, password: string) => { const t = Date.now(); const r = await request(app).post("/api/v1/auth/login").send({ username, password }); return { ms: Date.now() - t, r }; };
    await time(`nobody_${stamp}`, "Wrong-Pass-1!"); // warms the dummy hash
    // One bcrypt check at the server's cost, measured right now (so a busy test machine slows both equally).
    const hash = await bcrypt.hash("x", env.BCRYPT_ROUNDS);
    const t0 = Date.now(); await bcrypt.compare("y", hash); const bcryptMs = Date.now() - t0;
    const unknown = await time(`nobody2_${stamp}`, "Wrong-Pass-1!");
    const wrong = await time(`hint_${stamp}`, "Wrong-Pass-1!");
    expect(unknown.r.status).toBe(401);
    expect(wrong.r.status).toBe(401);
    expect(unknown.r.body.message).toBe(wrong.r.body.message);
    // An unknown username still pays for a full bcrypt check (without it, it would answer in a few ms).
    expect(unknown.ms).toBeGreaterThanOrEqual(bcryptMs * 0.5);
    const ok = await request(app).post("/api/v1/auth/login").send({ username: `hint_${stamp}`, password: MEMBER_PASSWORD });
    expect(ok.body.data).toMatchObject({ requiresOtp: true, email: "h***@example.com" });
  });

  it("Student or Teacher is set once: a member cannot change it afterwards", async () => {
    const app = createApp();
    const m = await newMember(app, `role_${Date.now()}`);
    const same = await request(app).patch("/api/v1/auth/profile").set("Authorization", `Bearer ${m.token}`).send({ memberType: "Student" });
    expect(same.status).toBe(200);
    const change = await request(app).patch("/api/v1/auth/profile").set("Authorization", `Bearer ${m.token}`).send({ memberType: "Teacher" });
    expect(change.status).toBe(409);
    expect(change.body.message).toMatch(/can only be set once/);
    expect((await prisma.user.findUnique({ where: { id: m.id } }))!.memberType).toBe("Student");
  });

  it("every account needs an email: members cannot be added without one, and an old account adds and confirms one at sign-in", async () => {
    const app = createApp();
    const stamp = Date.now();
    const admin = await adminToken(app);
    const noEmail = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${admin}`).send({ username: `noemail_${stamp}`, password: MEMBER_PASSWORD, displayName: "No Email", memberType: "Student" });
    expect(noEmail.status).toBe(400);

    // An account from before the rule (no email): the password gives only a short "add your email" token.
    const m = await newMember(app, `legacy_${stamp}`);
    await prisma.user.update({ where: { id: m.id }, data: { email: null } });
    const step1 = await request(app).post("/api/v1/auth/login").send({ username: `legacy_${stamp}`, password: MEMBER_PASSWORD });
    expect(step1.body.data.requiresEmail).toBe(true);
    expect(step1.body.data.token).toBeUndefined();
    const emailToken = step1.body.data.emailToken as string;
    const email = `legacy_${stamp}@example.test`;
    expect((await request(app).post("/api/v1/auth/email/send").send({ emailToken, email })).body.data).toEqual({ email: "l***@example.test" });
    // The code only confirms the address it was sent to.
    const { emailCodeHashForTest } = await import("../src/modules/auth/auth.service.js");
    await prisma.user.update({ where: { id: m.id }, data: { otpCode: emailCodeHashForTest("135790", email), otpExpiry: new Date(Date.now() + 60_000) } });
    expect((await request(app).post("/api/v1/auth/email/verify").send({ emailToken, email: `other_${stamp}@example.test`, code: "135790" })).status).toBe(400);
    expect((await request(app).post("/api/v1/auth/email/verify").send({ emailToken: "x".repeat(40), email, code: "135790" })).status).toBe(401);
    const done = await request(app).post("/api/v1/auth/email/verify").send({ emailToken, email, code: "135790" });
    expect(done.status).toBe(200);
    expect(done.body.data.token).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: m.id } })).email).toBe(email);
  });
});
