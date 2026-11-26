// Integration test (real database aklatone_e2e): school-issued books and lost-book documents. Fictional records only.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { fileKind, schoolYear } from "../src/modules/member-books/memberBooks.routes.js";
import { adminToken, newMember } from "./helpers.js";

const app = createApp();
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const stamp = Date.now();

describe("school-issued books", () => {
  it("uses the June-May school year", () => {
    expect(schoolYear(new Date("2026-06-01T02:00:00Z"))).toBe("SY 2026-2027");
    expect(schoolYear(new Date("2027-05-31T02:00:00Z"))).toBe("SY 2026-2027");
  });

  it("members add books one by one (no limit), the librarian checks them and marks them returned at year end", async () => {
    const admin = await adminToken(app);
    const m = await newMember(app, `issued_${stamp}`);
    for (let i = 1; i <= 3; i++) expect((await request(app).post("/api/v1/issued-books").set(as(m.token)).send({ title: `Science ${i} ${stamp}`, subject: "Science", code: `SCI-${i}` })).status).toBe(201);
    const mine = (await request(app).get("/api/v1/issued-books/mine").set(as(m.token))).body.data;
    expect(mine.items).toHaveLength(3);
    expect((await request(app).post("/api/v1/issued-books").set(as(admin)).send({ title: "x" })).status).toBe(403);

    const list = (await request(app).get(`/api/v1/issued-books?q=${stamp}`).set(as(admin))).body.data;
    expect(list.items).toHaveLength(3);
    expect(list.items[0]).toHaveProperty("memberId");
    const first = list.items[0].id;
    expect((await request(app).patch(`/api/v1/issued-books/${first}`).set(as(admin)).send({ checked: true })).status).toBe(200);
    expect((await request(app).delete(`/api/v1/issued-books/${first}`).set(as(m.token))).status).toBe(409); // checked: only the librarian changes it
    expect((await request(app).delete(`/api/v1/issued-books/${list.items[1].id}`).set(as(m.token))).status).toBe(200);
    const end = await request(app).post("/api/v1/issued-books/return-all").set(as(admin)).send({ schoolYear: schoolYear() });
    expect(end.body.data.returned).toBeGreaterThanOrEqual(2);
    expect((await request(app).get("/api/v1/issued-books/mine").set(as(m.token))).body.data.items.every((i: { status: string }) => i.status === "RETURNED")).toBe(true);
  });
});

describe("lost-book documents", () => {
  it("accepts PDF / Word / photos by their content only, and only the sender and the librarian can open them", async () => {
    expect(fileKind(Buffer.from("%PDF-1.7\nhello"))?.ext).toBe("pdf");
    expect(fileKind(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]))?.ext).toBe("docx");
    expect(fileKind(Buffer.from("<script>alert(1)</script>"))).toBeNull();

    const admin = await adminToken(app);
    const m = await newMember(app, `lost_${stamp}`);
    const other = await newMember(app, `lost_other_${stamp}`);
    const bad = await request(app).post("/api/v1/lost-reports?kind=APOLOGY&name=x.exe").set(as(m.token)).set("Content-Type", "application/octet-stream").send(Buffer.from("MZ not a document at all"));
    expect(bad.status).toBe(400);
    const sent = await request(app).post(`/api/v1/lost-reports?kind=APOLOGY&name=${encodeURIComponent("Sorry letter.pdf")}&message=${encodeURIComponent("I lost it on the bus.")}`)
      .set(as(m.token)).set("Content-Type", "application/octet-stream").send(Buffer.from("%PDF-1.4\n% fictional apology\n"));
    expect(sent.status).toBe(201);
    expect(sent.body.data).not.toHaveProperty("storedAs");
    const id = sent.body.data.id;

    expect((await request(app).get(`/api/v1/lost-reports/${id}/file`).set(as(other.token))).status).toBe(404);
    const file = await request(app).get(`/api/v1/lost-reports/${id}/file`).set(as(admin));
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain("attachment");
    expect(file.headers["content-type"]).toContain("application/pdf");

    const list = (await request(app).get("/api/v1/lost-reports?status=SUBMITTED").set(as(admin))).body.data;
    expect(list.items.find((r: { id: string }) => r.id === id)).toMatchObject({ kind: "APOLOGY", message: "I lost it on the bus.", fileName: "Sorry letter.pdf" });
    expect((await request(app).patch(`/api/v1/lost-reports/${id}`).set(as(admin)).send({ status: "ACCEPTED", note: "Thank you." })).status).toBe(200);
    expect((await request(app).get("/api/v1/lost-reports/mine").set(as(m.token))).body.data.items[0]).toMatchObject({ status: "ACCEPTED", note: "Thank you." });
  });
});
