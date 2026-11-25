// Integration test (real database aklatone_e2e): Time Spent. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { phDay } from "../src/modules/visits/visits.routes.js";
import { adminToken, avoidPhMidnight, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("Time Spent", () => {
  beforeAll(async () => { admin = await adminToken(app); });

  it("adds app time per day and platform, never more than 24 h a day, and only recent days", async () => {
    const m = await newMember(app, `time_a_${stamp}`);
    const today = phDay(new Date());
    const send = (body: object) => request(app).post("/api/v1/time/usage").set(as(m.token)).send(body);
    expect((await send({ platform: "mobile", days: [{ day: today, seconds: 600 }] })).status).toBe(200);
    expect((await send({ platform: "mobile", days: [{ day: today, seconds: 300 }, { day: "2020-01-01", seconds: 900 }] })).status).toBe(200);
    await send({ platform: "web", days: [{ day: today, seconds: 86_000 }] });
    await send({ platform: "web", days: [{ day: today, seconds: 86_000 }] });
    const rows = await prisma.appUsage.findMany({ where: { userId: m.id }, orderBy: { platform: "asc" } });
    expect(rows.map((r) => [r.platform, r.day, r.seconds])).toEqual([["mobile", today, 900], ["web", today, 86_400]]);
    expect((await send({ platform: "tv", days: [{ day: today, seconds: 1 }] })).status).toBe(400);
  });

  it("library time comes from the Visitor's Log (Time In to Time Out), loans from borrowed to returned", async () => {
    const restoreClock = avoidPhMidnight();
    try {
    const m = await newMember(app, `time_b_${stamp}`);
    const code = (await prisma.user.findUnique({ where: { id: m.id } }))!.maskedId!;
    const kiosk = (await request(app).post("/api/v1/visits/kiosk/start").set(as(admin))).body.data.token;
    const t0 = new Date(Date.now() - 3 * 3600_000);
    const scan = (at: Date) => request(app).post("/api/v1/visits/scan").set(as(kiosk)).send({ memberCode: code, at: at.toISOString() });
    await scan(t0);
    await scan(new Date(t0.getTime() + 40 * 60_000));
    await scan(new Date(t0.getTime() + 90 * 60_000)); // still inside: not counted until Time Out

    const book = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Time Book ${stamp}`, copies: 1 });
    const loan = await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ borrowerId: m.id, bookId: book.body.data.id });
    await prisma.borrowingTransaction.update({ where: { id: loan.body.data.id }, data: { borrowedAt: new Date(Date.now() - 5 * 86_400_000) } });
    await request(app).post("/api/v1/circulation/return").set(as(admin)).send({ transactionId: loan.body.data.id, outcome: "RETURNED_ON_TIME" });

    const me = (await request(app).get("/api/v1/time/me").set(as(m.token))).body.data;
    expect(me.library).toMatchObject({ visits: 2, seconds: 40 * 60, averageSeconds: 40 * 60, insideNow: true });
    expect(me.loans).toMatchObject({ returned: 1, averageDays: 5 });
    expect(me.app.days).toHaveLength(7);
    // The librarian sees the same numbers in Members > View; members cannot see others.
    expect((await request(app).get(`/api/v1/time/members/${m.id}`).set(as(admin))).body.data.library.seconds).toBe(40 * 60);
    expect((await request(app).get(`/api/v1/time/members/${m.id}`).set(as(m.token))).status).toBe(403);

    const sum = (await request(app).get(`/api/v1/time/summary?from=${phDay(t0)}&to=${phDay(new Date())}`).set(as(admin))).body.data;
    expect(sum.library.visits).toBeGreaterThanOrEqual(2);
    expect(sum.library.withoutTimeOut).toBeGreaterThanOrEqual(1);
    expect(sum.loans.returned).toBeGreaterThanOrEqual(1);
    expect((await request(app).get("/api/v1/time/summary?from=2026-12-01&to=2026-11-01").set(as(admin))).status).toBe(400);
    } finally { restoreClock(); }
  });
});
