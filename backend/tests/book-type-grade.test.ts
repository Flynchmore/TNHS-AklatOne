// Real database (aklatone_e2e): book type, grade level, date received and copy location (manuscript Chapter 1).
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, newMember } from "./helpers.js";
import { normBookType, normGradeLevel } from "../src/modules/catalog/catalog.import.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("book type, grade level, date received and location", () => {
  beforeAll(async () => { admin = await adminToken(app); });

  it("saves them on a new book and its first copies, and filters the catalog by type and grade", async () => {
    const title = `Grade Book ${stamp}`;
    const made = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title, serialNumber: `GRD-${stamp % 1e8}`, bookType: "Textbook", gradeLevel: "Grade 8", copies: 2, dateReceived: "2026-06-15", location: "Shelf A3" });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ bookType: "Textbook", gradeLevel: "Grade 8" });
    const copies = await prisma.bookCopy.findMany({ where: { bookId: made.body.data.id } });
    expect(copies.map((c) => [c.location, c.acquiredAt?.toISOString()])).toEqual([["Shelf A3", "2026-06-14T16:00:00.000Z"], ["Shelf A3", "2026-06-14T16:00:00.000Z"]]);
    await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `All Grades ${stamp}`, gradeLevel: "All grade levels", bookType: "Other" });

    const member = await newMember(app, `grade_${stamp}`);
    const list = async (qs: string) => ((await request(app).get(`/api/v1/catalog?q=${stamp}&${qs}`).set(as(member.token))).body.data.items as { title: string }[]).map((b) => b.title).sort();
    expect(await list("gradeLevel=Grade%208")).toEqual([`All Grades ${stamp}`, title]); // "All grade levels" books show under every grade
    expect(await list("gradeLevel=Grade%209")).toEqual([`All Grades ${stamp}`]);
    expect(await list("bookType=Textbook")).toEqual([title]);
    expect((await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: "x", gradeLevel: "Grade 13" })).status).toBe(400);
  });

  it("edits the location, date received and notes of one copy (staff only)", async () => {
    const book = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Copy Edit ${stamp}`, copies: 1 });
    const copy = await prisma.bookCopy.findFirstOrThrow({ where: { bookId: book.body.data.id } });
    const member = await newMember(app, `copyedit_${stamp}`);
    expect((await request(app).patch(`/api/v1/book-copies/${copy.id}`).set(as(member.token)).send({ location: "X" })).status).toBe(403);
    const r = await request(app).patch(`/api/v1/book-copies/${copy.id}`).set(as(admin)).send({ location: "Filipiniana shelf 2", dateReceived: "2025-07-01", notes: "Donated" });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ location: "Filipiniana shelf 2", notes: "Donated", acquiredAt: "2025-06-30T16:00:00.000Z" });
    expect((await request(app).patch(`/api/v1/book-copies/${copy.id}`).set(as(admin)).send({ location: "", dateReceived: "" })).body.data).toMatchObject({ location: null, acquiredAt: null, notes: "Donated" });
  });

  it("reads book type and grade level from Excel spellings", () => {
    expect(["textbook", "TEACHER'S MANUAL", "teachers manual", "Activity sheet", "other"].map(normBookType)).toEqual(["Textbook", "Teacher's Manual", "Teacher's Manual", "Worksheet", "Other"]);
    expect(["7", "Grade 07", "grade 12", "All", "Grade 13"].map(normGradeLevel)).toEqual(["Grade 7", "Grade 7", "Grade 12", "All grade levels", "Grade 13"]);
  });
});
