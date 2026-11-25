// Real database (aklatone_e2e): member self-registration with an emailed activation code, Student/Teacher set once,
// and the emailed code needed to change a password. Fictional records only; tests never send real email.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { adminToken } from "./helpers.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { otpHash } from "../src/modules/auth/auth.service.js";

const app = createApp();
const stamp = Date.now();
const PW = "Test-Pass-2026!";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const plantCode = (username: string, code: string, minutes = 10) =>
  prisma.user.update({ where: { username }, data: { otpCode: otpHash(code), otpExpiry: new Date(Date.now() + minutes * 60_000) } });
const form = (n: string, extra: object = {}) => ({
  username: `selfreg_${n}_${stamp}`, password: PW, displayName: "Juan Dela Cruz", email: `selfreg_${n}_${stamp}@example.com`,
  memberType: "Student", gender: "Male", gradeSection: "Grade 10 - Rizal", hobbies: "Reading", ...extra,
});

describe("self-registration", () => {
  it("stays inactive until the activation code is entered, then signs in with a Member ID", async () => {
    const f = form("a");
    const r = await request(app).post("/api/v1/auth/register").send(f);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ requiresActivation: true, email: "s***@example.com" });
    const pending = await prisma.user.findUniqueOrThrow({ where: { username: f.username } });
    expect(pending).toMatchObject({ isActive: false, activationPending: true, maskedId: null, memberType: "Student", gradeSection: "Grade 10 - Rizal", department: null });

    // Signing in before activation sends a new activation code instead of a token.
    const early = await request(app).post("/api/v1/auth/login").send({ username: f.username, password: PW });
    expect(early.body.data).toMatchObject({ requiresActivation: true });
    expect(early.body.data.token).toBeUndefined();

    await plantCode(f.username, "123456");
    expect((await request(app).post("/api/v1/auth/activate").send({ username: f.username, code: "654321" })).status).toBe(400);
    const done = await request(app).post("/api/v1/auth/activate").send({ username: f.username, code: "123456" });
    expect(done.status).toBe(200);
    expect(done.body.data.token).toBeTruthy();
    expect(done.body.data.user.maskedId).toMatch(/^JC\d{6}$/);
    expect((await request(app).post("/api/v1/auth/activate").send({ username: f.username, code: "123456" })).status).toBe(400);

    // Role was chosen once at sign-up: the member cannot switch it.
    expect((await request(app).patch("/api/v1/auth/profile").set(as(done.body.data.token)).send({ memberType: "Teacher" })).status).toBe(409);
  });

  it("refuses a used username or email, but frees one held by an expired, never-activated sign-up", async () => {
    const f = form("b");
    await request(app).post("/api/v1/auth/register").send(f);
    expect((await request(app).post("/api/v1/auth/register").send({ ...f, username: `${f.username}x` })).status).toBe(409);
    await plantCode(f.username, "111111", -1); // the activation code expired
    const again = await request(app).post("/api/v1/auth/register").send({ ...f, displayName: "Maria Santos", memberType: "Teacher", department: "Science", position: "Teacher I" });
    expect(again.status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { username: f.username } })).toMatchObject({ displayName: "Maria Santos", memberType: "Teacher", gradeSection: null, department: "Science" });
  });

  it("does not list unactivated sign-ups among the librarian's members", async () => {
    const f = form("c");
    await request(app).post("/api/v1/auth/register").send(f);
    const admin = await adminToken(app);
    const list = await request(app).get(`/api/v1/users?q=${f.username}`).set(as(admin));
    expect(list.body.data.total).toBe(0);
  });

  it("needs the emailed code to change a password when the account has an email", async () => {
    const f = form("d");
    await request(app).post("/api/v1/auth/register").send(f);
    await plantCode(f.username, "222222");
    const token = (await request(app).post("/api/v1/auth/activate").send({ username: f.username, code: "222222" })).body.data.token as string;

    const sent = await request(app).post("/api/v1/auth/password-code").set(as(token));
    expect(sent.body.data).toEqual({ needsCode: true, email: "s***@example.com" });
    expect((await request(app).post("/api/v1/auth/password-code").set(as(token))).status).toBe(429); // one a minute
    expect((await request(app).patch("/api/v1/auth/profile").set(as(token)).send({ currentPassword: PW, password: "New-Pass-2026!!" })).status).toBe(400);
    await plantCode(f.username, "333333");
    expect((await request(app).patch("/api/v1/auth/profile").set(as(token)).send({ currentPassword: PW, password: "New-Pass-2026!!", code: "999999" })).status).toBe(400);
    const ok = await request(app).patch("/api/v1/auth/profile").set(as(token)).send({ currentPassword: PW, password: "New-Pass-2026!!", code: "333333" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
  });
});
