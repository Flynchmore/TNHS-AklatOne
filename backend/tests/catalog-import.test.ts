// Integration test (real database aklatone_e2e, like borrow-flow). Fictional books only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";
import { parseWorkbook } from "../src/modules/catalog/catalog.import.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = "";

async function xlsx(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const preview = (buf: Buffer) => request(app).post("/api/v1/catalog/import/preview").set(auth(admin)).set("Content-Type", "application/octet-stream").send(buf);

describe("Excel catalog import", () => {
  beforeAll(async () => {
    const a = await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" });
    expect(a.status).toBe(200);
    admin = a.body.data.token;
  });

  it("reads header aliases, skips a title row above the header and reports unknown columns", async () => {
    const { rows, ignoredColumns } = await parseWorkbook(await xlsx([["Old inventory 2019"], ["Book Title", "Author(s)", "Accession No.", "Shelf color"], ["A", "B", "ACC-1", "red"], [], ["C", "", "", ""]]));
    expect(rows.map((r) => r.values.title)).toEqual(["A", "C"]);
    expect(rows[0]!.values.serialNumber).toBe("ACC-1");
    expect(ignoredColumns).toEqual(["Shelf color"]);
  });

  it("refuses a non-Excel file and a sheet without a Title column", async () => {
    expect((await preview(Buffer.from("not excel"))).status).toBe(400);
    expect((await preview(await xlsx([["Name", "Qty"], ["x", 1]]))).status).toBe(400);
  });

  it("previews new / changed / error rows, then applies them in one transaction; missing books are only hidden when asked", async () => {
    const existing = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `Import Existing ${stamp}`, authors: "Fictional Author", serialNumber: `IMP-${stamp % 1e8}`, copies: 1 });
    expect(existing.status).toBe(201);
    const id = existing.body.data.id as string;
    const serial = `IMP-${stamp % 1e8}`;

    const file = await xlsx([
      ["Title", "Author", "Serial No.", "Publisher", "Year", "Copies", "Genre", "Remarks"],
      [`Import New ${stamp}`, "Fictional Writer", "", "Sample Press", 2020, 2, "", "x"],
      [`Import Existing ${stamp}`, "", serial, "New Publisher", "", 3, "", ""],
      ["", "No title", "", "", "", "", "", ""],
      [`Bad Year ${stamp}`, "", "", "", "abc", "", "", ""],
      [`Bad Genre ${stamp}`, "", "", "", "", "", "No Such Genre Zz", ""],
    ]);
    const p = await preview(file);
    expect(p.status).toBe(200);
    const d = p.body.data;
    expect(d.ignoredColumns).toEqual(["Remarks"]);
    expect(d.create.map((c: { title: string }) => c.title)).toEqual([`Import New ${stamp}`]);
    const upd = d.update.find((u: { id: string }) => u.id === id);
    expect(upd.changes).toEqual(expect.arrayContaining([{ field: "Publisher", from: "(blank)", to: "New Publisher" }, { field: "Copies", from: "1", to: "3" }]));
    // Blank Author cell did not blank the existing author.
    expect(upd.changes.some((c: { field: string }) => c.field === "Author")).toBe(false);
    expect(d.errors.map((e: { row: number }) => e.row)).toEqual([4, 5, 6]);
    expect(d.hide.length).toBeGreaterThan(0); // other e2e books are not in this file

    const applied = await request(app).post("/api/v1/catalog/import/apply").set(auth(admin)).send({ token: d.token, hideMissing: false });
    expect(applied.status).toBe(200);
    expect(applied.body.data).toMatchObject({ created: 1, hidden: 0, skipped: 3 });
    expect((await request(app).post("/api/v1/catalog/import/apply").set(auth(admin)).send({ token: d.token })).status).toBe(410);

    const after = await request(app).get(`/api/v1/catalog/${id}`).set(auth(admin));
    expect(after.body.data.publisher).toBe("New Publisher");
    expect(after.body.data.authors).toBe("Fictional Author");
    const copies = await request(app).get(`/api/v1/book-copies?bookId=${id}`).set(auth(admin));
    expect(copies.body.data.items ?? copies.body.data).toHaveLength(3);
  });

  it("hidden books disappear for members and visitors, but not for staff, and can be shown again", async () => {
    const b = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `Hidden Test ${stamp}` });
    const id = b.body.data.id as string;
    expect((await request(app).patch(`/api/v1/catalog/${id}`).set(auth(admin)).send({ isHidden: true })).status).toBe(200);
    expect((await request(app).get(`/api/v1/catalog/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/catalog?q=Hidden Test ${stamp}`)).body.data.total).toBe(0);
    expect((await request(app).get(`/api/v1/catalog?q=Hidden Test ${stamp}`).set(auth(admin))).body.data.total).toBe(1);
    expect((await request(app).patch(`/api/v1/catalog/${id}`).set(auth(admin)).send({ isHidden: false })).status).toBe(200);
    expect((await request(app).get(`/api/v1/catalog/${id}`)).status).toBe(200);
  });

  it("exports the reports as an Excel workbook with every sheet", async () => {
    const r = await request(app).get("/api/v1/reports/export.xlsx?from=2020-01-01T00:00:00%2B08:00").set(auth(admin)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    expect(r.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Loans", "Popular books", "Copies by status", "Overdue", "Library visits"]);
    expect(String(wb.getWorksheet("Summary")!.getCell("B2").value)).toContain("308114");
  });

  it("exports the catalog and the template as Excel", async () => {
    for (const path of ["/api/v1/catalog/export.xlsx", "/api/v1/catalog/import-template.xlsx"]) {
      const r = await request(app).get(path).set(auth(admin)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
      expect(r.status).toBe(200);
      const { rows } = await parseWorkbook(r.body as Buffer);
      expect(rows.length).toBeGreaterThan(0);
    }
  });
});
