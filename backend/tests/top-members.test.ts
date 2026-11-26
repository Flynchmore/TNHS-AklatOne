// Integration test (real database aklatone_e2e): most active members. Fictional records only.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { periodRange, topMembers } from "../src/modules/reports/topMembers.js";
import { adminToken, avoidPhMidnight, newMember } from "./helpers.js";

const app = createApp();
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("top active members", () => {
  it("uses Philippine days: today, the Monday-Friday week, the calendar month", () => {
    const wed = new Date("2026-11-25T04:00:00Z"); // Wednesday noon in Manila
    expect(periodRange("day", wed)).toMatchObject({ from: "2026-11-25", to: "2026-11-25" });
    expect(periodRange("week", wed)).toMatchObject({ from: "2026-11-23", to: "2026-11-27" });
    expect(periodRange("month", wed)).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange("week", new Date("2026-11-29T04:00:00Z"))).toMatchObject({ from: "2026-11-23" }); // Sunday: week just ended
  });

  it("ranks members by borrows, reviews and visits and shows only Member ID, photo and section", async () => {
    const restore = avoidPhMidnight();
    try {
      const admin = await adminToken(app);
      const m = await newMember(app, `top_${Date.now()}`, { gradeSection: "9 - Rizal" });
      const code = (await prisma.user.findUnique({ where: { id: m.id } }))!.maskedId!;
      const book = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Top Book ${Date.now()}`, copies: 2 });
      expect((await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ memberCode: code, bookId: book.body.data.id })).status).toBe(201);
      const r = await request(app).get("/api/v1/reports/top-members?period=day&limit=500").set(as(admin));
      expect(r.status).toBe(200);
      expect(r.body.data.items.length).toBeLessThanOrEqual(50);
      // The test database has many active members today, so look in the full ranking.
      const me = (await topMembers("day", 100_000)).items.find(i => i.maskedId === code)!;
      expect(me).toMatchObject({ group: "9 - Rizal", borrows: 1, books: [book.body.data.title] });
      expect(me.score).toBeGreaterThanOrEqual(3);
      expect(me).not.toHaveProperty("displayName");

      // The member sees the board (no names) and their own activity log.
      const board = await request(app).get("/api/v1/catalog/top-readers?period=day").set(as(m.token));
      expect(board.status).toBe(200);
      expect(JSON.stringify(board.body.data.items)).not.toContain("displayName");
      const log = await request(app).get("/api/v1/auth/my-activity?period=day").set(as(m.token));
      expect(log.status).toBe(200);
      expect(log.body.data.items.map((i: { text: string }) => i.text)).toContain(`Borrowed "${book.body.data.title}"`);
      expect((await request(app).get("/api/v1/auth/my-activity?period=yesterday").set(as(m.token))).body.data.items).toEqual([]);

      // The librarian's "Continue where you left off".
      const resume = await request(app).get("/api/v1/reports/resume").set(as(admin));
      expect(resume.status).toBe(200);
      expect(resume.body.data.waiting).toHaveProperty("pendingRequests");
      expect(resume.body.data.lastActions.length).toBeGreaterThan(0);
    } finally { restore(); }
  });
});
