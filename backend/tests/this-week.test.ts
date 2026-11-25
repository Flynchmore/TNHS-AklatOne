// Unit checks + integration on aklatone_e2e: books used this week and the borrowed-books tally. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { schoolWeek } from "../src/modules/reports/reports.routes.js";
import { adminToken, newMember } from "./helpers.js";

describe("school week (Monday-Friday, PH time)", () => {
  it("any day maps to its Monday-Friday; weekends show the week just ended", () => {
    const week = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
    expect(schoolWeek("2026-11-23")).toEqual(week); // Monday
    expect(schoolWeek("2026-11-27")).toEqual(week); // Friday
    expect(schoolWeek("2026-11-28")).toEqual(week); // Saturday
    expect(schoolWeek("2026-11-29")).toEqual(week); // Sunday
    expect(schoolWeek("2026-11-30")[0]).toBe("2026-11-30");
    expect(schoolWeek("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  describe("on the E2E database", () => {
    const app = createApp();
    const stamp = Date.now();
    let admin = "";
    beforeAll(async () => { admin = await adminToken(app); });
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });

    it("counts this week's loans per day and the titles, and the member tally matches the member's own records", async () => {
      const m = await newMember(app, `week_${stamp}`);
      const book = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Week Book ${stamp}`, copies: 2 });
      const before = (await request(app).get("/api/v1/reports/this-week").set(as(admin))).body.data;
      for (let i = 0; i < 2; i++) expect((await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ borrowerId: m.id, bookId: book.body.data.id })).status).toBe(201);
      const after = (await request(app).get("/api/v1/reports/this-week").set(as(admin))).body.data;
      expect(after.days).toHaveLength(5);
      expect(after.totals.borrowed - before.totals.borrowed).toBeGreaterThanOrEqual(2);
      // The list holds the 20 most borrowed titles; on a busy test database this new book may not be among them.
      expect(after.totals.titles).toBeGreaterThanOrEqual(1);
      expect(after.books.length).toBeLessThanOrEqual(20);

      const listed = (await request(app).get(`/api/v1/users?q=week_${stamp}`).set(as(admin))).body.data.items[0];
      const mine = (await request(app).get("/api/v1/circulation/transactions?status=ACTIVE").set(as(m.token))).body.data.items;
      expect(listed).toMatchObject({ activeLoans: 2, totalLoans: 2 });
      expect(mine).toHaveLength(listed.activeLoans);
    });
  });
});
