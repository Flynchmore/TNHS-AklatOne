// Integration test (real database aklatone_e2e): Visitor's Log kiosk. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { phDay, REPEAT_MS, visitShortCode } from "../src/modules/visits/visits.routes.js";
import { adminToken, avoidPhMidnight, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
let admin = "", kiosk = "";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const scan = (memberCode: string, at?: Date) => request(app).post("/api/v1/visits/scan").set(as(kiosk)).send({ memberCode, ...(at ? { at: at.toISOString() } : {}) });
const codeOf = async (id: string) => (await prisma.user.findUnique({ where: { id } }))!.maskedId!;

describe("Visitor's Log kiosk", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
    const r = await request(app).post("/api/v1/visits/kiosk/start").set(as(admin));
    expect(r.status).toBe(200);
    kiosk = r.body.data.token;
  });

  it("the kiosk token can only record visits; leaving needs the librarian's password", async () => {
    expect((await request(app).get("/api/v1/users").set(as(kiosk))).status).toBe(403);
    expect((await request(app).post("/api/v1/backup/download").set(as(kiosk)).send({ currentPassword: "x" })).status).toBe(403);
    const me = (await request(app).get("/api/v1/auth/me").set(as(kiosk))).body.data;
    expect(me).toMatchObject({ role: "KIOSK", permissions: ["visits:kiosk"] });
    expect((await request(app).post("/api/v1/visits/kiosk/exit").set(as(kiosk)).send({ password: "wrong" })).status).toBe(400);
    const exit = await request(app).post("/api/v1/visits/kiosk/exit").set(as(kiosk)).send({ password: "TestPass123!" });
    expect(exit.status).toBe(200);
    expect((await request(app).get("/api/v1/users?limit=1").set(as(exit.body.data.token))).status).toBe(200);
  });

  it("first scan = Time In, next = Time Out; a repeat within a minute is ignored", async () => {
    const restoreClock = avoidPhMidnight();
    try {
    const m = await newMember(app, `visit_a_${stamp}`);
    const code = await codeOf(m.id);
    const t0 = new Date(Date.now() - 2 * 3600_000);
    expect((await scan(code.toLowerCase(), t0)).body.data.action).toBe("in");
    expect((await scan(code, new Date(t0.getTime() + 10_000))).body.data.action).toBe("ignored");
    const out = await scan(code, new Date(t0.getTime() + 45 * 60_000));
    expect(out.body.data.action).toBe("out");
    expect(new Date(out.body.data.visit.timeOut).getTime() - new Date(out.body.data.visit.timeIn).getTime()).toBe(45 * 60_000);
    expect((await scan(code, new Date(t0.getTime() + 45 * 60_000 + REPEAT_MS / 2))).body.data.action).toBe("ignored");
    expect((await scan(code, new Date(t0.getTime() + 90 * 60_000))).body.data.action).toBe("in");
    const today = (await request(app).get("/api/v1/visits/today").set(as(kiosk))).body.data.items.filter((v: { memberCode: string }) => v.memberCode === code);
    expect(today).toHaveLength(2);
    // The kiosk list carries no names.
    expect(Object.keys(today[0]).sort()).toEqual(["books", "id", "memberCode", "timeIn", "timeOut"]);
    expect(today[0].books).toEqual([]); // titles of books borrowed today (none here)
    } finally { restoreClock(); }
  });

  it("a Time In left open on an earlier day is not closed by today's scan (no guessed Time Out)", async () => {
    const m = await newMember(app, `visit_b_${stamp}`);
    const code = await codeOf(m.id);
    const yesterday = new Date(Date.now() - 26 * 3600_000);
    expect((await scan(code, yesterday)).body.data.action).toBe("in");
    expect((await scan(code)).body.data.action).toBe("in");
    const visits = await prisma.libraryVisit.findMany({ where: { memberId: m.id }, orderBy: { timeIn: "asc" } });
    expect(visits.map((v) => [v.day, v.timeOut])).toEqual([[phDay(yesterday), null], [phDay(new Date()), null]]);
  });

  it("refuses unknown Member IDs, bad times, and member tokens", async () => {
    expect((await scan("ZZ999999")).status).toBe(404);
    const m = await newMember(app, `visit_c_${stamp}`);
    const code = await codeOf(m.id);
    expect((await scan(code, new Date(Date.now() + 3600_000))).status).toBe(400);
    expect((await scan(code, new Date(Date.now() - 30 * 86400_000))).status).toBe(400);
    // (The ADMIN role has every permission by design; members and librarians' normal tokens cannot record visits.)
    expect((await request(app).post("/api/v1/visits/scan").set(as(m.token)).send({ memberCode: code })).status).toBe(403);
  });

  it("phone check-in works only with the kiosk's fresh QR code", async () => {
    const m = await newMember(app, `visit_d_${stamp}`);
    const qr = (await request(app).get("/api/v1/visits/kiosk/qr").set(as(kiosk))).body.data.code as string;
    expect(qr).toMatch(/^AKLATONE-VISIT:/);
    const ok = await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code: qr });
    expect(ok.status).toBe(201);
    expect(ok.body.data.action).toBe("in");
    expect((await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code: "AKLATONE-VISIT:forged.token.value" })).status).toBe(400);
    expect((await request(app).post("/api/v1/visits/phone").set(as(admin)).send({ code: qr })).status).toBe(403);
  });

  it("phone check-in also takes the 6-digit code typed from the kiosk screen", async () => {
    const m = await newMember(app, `visit_e_${stamp}`);
    const short = (await request(app).get("/api/v1/visits/kiosk/qr").set(as(kiosk))).body.data.shortCode as string;
    expect(short).toMatch(/^\d{6}$/);
    const stale = visitShortCode(Date.now() - 90_000);
    if (stale !== short && stale !== visitShortCode(Date.now() - 30_000)) {
      expect((await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code: stale })).status).toBe(400);
    }
    const r = await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code: short });
    expect(r.status).toBe(201);
    expect(r.body.data.action).toBe("in");
  });

  it("limits wrong 6-digit codes per member, not per school IP", async () => {
    const m = await newMember(app, `visit_f_${stamp}`);
    const other = await newMember(app, `visit_g_${stamp}`);
    const now = new Set([visitShortCode(Date.now()), visitShortCode(Date.now() - 30_000)]);
    const wrong = ["000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999", "123456", "654321"].filter(c => !now.has(c)).slice(0, 10);
    for (const code of wrong) expect((await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code })).status).toBe(400);
    expect((await request(app).post("/api/v1/visits/phone").set(as(m.token)).send({ code: wrong[0] })).status).toBe(429);
    // Another member on the same Wi-Fi is not affected.
    expect((await request(app).post("/api/v1/visits/phone").set(as(other.token)).send({ code: wrong[0] })).status).toBe(400);
  });
});

describe("Visitor's Log list: books borrowed today", () => {
  it("shows the titles a visitor borrowed today next to the Member ID (no names)", async () => {
    const restoreClock = avoidPhMidnight();
    try {
      const m = await newMember(app, `visit_book_${stamp}`);
      const code = await codeOf(m.id);
      const book = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Kiosk Book ${stamp}`, copies: 1 });
      expect(book.status).toBe(201);
      expect((await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ memberCode: code, bookId: book.body.data.id })).status).toBe(201);
      expect((await scan(code)).body.data.action).toBe("in");
      const row = (await request(app).get("/api/v1/visits/today").set(as(kiosk))).body.data.items.find((v: { memberCode: string }) => v.memberCode === code);
      expect(row.books).toEqual([`Kiosk Book ${stamp}`]);
    } finally { restoreClock(); }
  });
});
