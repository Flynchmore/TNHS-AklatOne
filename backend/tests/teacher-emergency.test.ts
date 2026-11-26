// Integration test (real database aklatone_e2e): a teacher takes a book while no librarian is in. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, avoidPhMidnight, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = "", kiosk = "", bookId = "";

describe("teacher emergency borrowing (librarian away)", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
    kiosk = (await request(app).post("/api/v1/visits/kiosk/start").set(as(admin))).body.data.token;
    const b = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Emergency Book ${stamp}`, copies: 2 });
    bookId = b.body.data.id;
  });

  it("needs a teacher who timed in today; then the request is marked as already taken for the librarian", async () => {
    const restore = avoidPhMidnight();
    try {
      const student = await newMember(app, `emerg_s_${stamp}`);
      expect((await request(app).post("/api/v1/borrow-requests").set(as(student.token)).send({ bookId, takenNow: true })).status).toBe(403);

      const teacher = await newMember(app, `emerg_t_${stamp}`, { memberType: "Teacher", department: "Science" });
      const tooEarly = await request(app).post("/api/v1/borrow-requests").set(as(teacher.token)).send({ bookId, takenNow: true });
      expect(tooEarly.status).toBe(409);
      expect(tooEarly.body.message).toMatch(/Time in/);

      const code = (await prisma.user.findUnique({ where: { id: teacher.id } }))!.maskedId!;
      expect((await request(app).post("/api/v1/visits/scan").set(as(kiosk)).send({ memberCode: code })).body.data.action).toBe("in");
      const ok = await request(app).post("/api/v1/borrow-requests").set(as(teacher.token)).send({ bookId, takenNow: true });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ status: "PENDING", takenNow: true });
      const list = (await request(app).get("/api/v1/borrow-requests?status=PENDING").set(as(admin))).body.data.items;
      expect(list.find((r: { id: string }) => r.id === ok.body.data.id)).toMatchObject({ takenNow: true });
    } finally { restore(); }
  });
});
