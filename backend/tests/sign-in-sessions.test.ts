// Real database (aklatone_e2e): sign-in sessions, signing a device out, and the device name / network labels.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { otpHash } from "../src/modules/auth/auth.service.js";
import { deviceLabel, networkLabel, tokenLifetimeMs } from "../src/modules/auth/sessions.routes.js";
import { adminToken, MEMBER_PASSWORD, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const signIn = async (username: string, ua: string, app_?: string) => {
  const r = await request(app).post("/api/v1/auth/login").set("User-Agent", ua).set(app_ ? { "X-AklatOne-App": app_ } : {}).send({ username, password: MEMBER_PASSWORD });
  expect(r.status).toBe(200);
  return r.body.data.token as string;
};

describe("sign-in sessions", () => {
  let admin: string;
  beforeAll(async () => { admin = await adminToken(app); });

  it("names devices and networks without any outside service", () => {
    expect(deviceLabel(LAPTOP)).toBe("Edge on Windows");
    expect(deviceLabel(PHONE, "android")).toBe("AklatOne app on Android");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64)", "desktop")).toBe("AklatOne Desktop on Linux");
    expect(networkLabel("192.168.1.20")).toMatch(/^School \/ local network/);
    expect(networkLabel("203.0.113.9")).toBe("Internet (IP address 203.0.113.9)");
  });

  it("lists each sign-in, and signing one out needs the password and ends that device's token at once", async () => {
    await newMember(app, `sess_a_${stamp}`);
    const phone = await signIn(`sess_a_${stamp}`, PHONE, "android");
    const laptop = await signIn(`sess_a_${stamp}`, LAPTOP);

    const list = (await request(app).get("/api/v1/auth/sessions").set(as(laptop))).body.data.items as { id: string; device: string; current: boolean }[];
    const mine = list.find((s) => s.current)!;
    const other = list.find((s) => s.device === "AklatOne app on Android")!;
    expect(mine.device).toBe("Edge on Windows");
    expect(other.current).toBe(false);

    expect((await request(app).post("/api/v1/auth/sessions/revoke").set(as(laptop)).send({ sessionId: other.id, password: "Wrong-Pass-1!" })).status).toBe(400);
    expect((await request(app).get("/api/v1/auth/me").set(as(phone))).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/sessions/revoke").set(as(laptop)).send({ sessionId: other.id, password: MEMBER_PASSWORD })).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set(as(phone))).status).toBe(401);
    expect((await request(app).get("/api/v1/auth/me").set(as(laptop))).status).toBe(200);
  });

  it("accounts with an email also need the emailed code; 'all other devices' keeps only this one", async () => {
    const username = `sess_b_${stamp}`;
    const made = await request(app).post("/api/v1/users").set(as(admin)).send({ username, password: MEMBER_PASSWORD, displayName: "Juan Dela Cruz", memberType: "Student", email: `${username}@example.com` });
    expect(made.status).toBe(201);
    const withCode = async (ua: string) => {
      const step1 = await request(app).post("/api/v1/auth/login").set("User-Agent", ua).send({ username, password: MEMBER_PASSWORD });
      expect(step1.body.data.requiresOtp).toBe(true);
      await prisma.user.update({ where: { id: made.body.data.id }, data: { otpCode: otpHash("246810"), otpExpiry: new Date(Date.now() + 60_000) } });
      return (await request(app).post("/api/v1/auth/verify-login-otp").set("User-Agent", ua).send({ username, otp: "246810" })).body.data.token as string;
    };
    const first = await withCode(PHONE);
    const second = await withCode(LAPTOP);

    expect((await request(app).post("/api/v1/auth/sessions/code").set(as(second))).body.data).toMatchObject({ needsCode: true, email: "s***@example.com" });
    expect((await request(app).post("/api/v1/auth/sessions/revoke").set(as(second)).send({ others: true, password: MEMBER_PASSWORD })).status).toBe(400);
    await prisma.user.update({ where: { id: made.body.data.id }, data: { otpCode: otpHash("135790"), otpExpiry: new Date(Date.now() + 60_000) } });
    const r = await request(app).post("/api/v1/auth/sessions/revoke").set(as(second)).send({ others: true, password: MEMBER_PASSWORD, code: "135790" });
    expect(r.status).toBe(200);
    const fresh = r.body.data.token as string;

    expect((await request(app).get("/api/v1/auth/me").set(as(first))).status).toBe(401);
    expect((await request(app).get("/api/v1/auth/me").set(as(fresh))).status).toBe(200);
    const left = (await request(app).get("/api/v1/auth/sessions").set(as(fresh))).body.data.items as { current: boolean }[];
    expect(left).toHaveLength(1);
    expect(left[0]!.current).toBe(true);
  });

  it("is not available on the Visitor's Log kiosk", async () => {
    const kiosk = (await request(app).post("/api/v1/visits/kiosk/start").set(as(admin))).body.data.token as string;
    expect((await request(app).get("/api/v1/auth/sessions").set(as(kiosk))).status).toBe(403);
  });

  it("does not list sessions whose token has already expired", async () => {
    const m = await newMember(app, `sess_c_${stamp}`);
    const token = await signIn(`sess_c_${stamp}`, LAPTOP);
    await prisma.session.create({ data: { userId: m.id, device: "Old phone", ip: null, createdAt: new Date(Date.now() - tokenLifetimeMs() - 60_000) } });
    const devices = ((await request(app).get("/api/v1/auth/sessions").set(as(token))).body.data.items as { device: string }[]).map((s) => s.device);
    expect(devices).not.toContain("Old phone");
    expect(devices).toContain("Edge on Windows");
    expect(tokenLifetimeMs("1d")).toBe(86_400_000);
    expect(tokenLifetimeMs("12h")).toBe(43_200_000);
    expect(tokenLifetimeMs("3600")).toBe(3_600_000);
  });
});
