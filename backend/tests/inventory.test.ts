// Integration test (real database aklatone_e2e). Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { adminToken } from "./helpers.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const auth = () => ({ Authorization: `Bearer ${admin}` });

describe("inventory audit", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
    // A run that stopped half-way may have left an audit open on the E2E database.
    await prisma.inventoryAudit.updateMany({ where: { closedAt: null }, data: { closedAt: new Date() } });
  });

  it("scans copies, reports the ones not found and the ones whose record disagrees, then closes", async () => {
    const serial = `INV-${stamp % 1e8}`;
    const book = await request(app).post("/api/v1/catalog").set(auth()).send({ title: `Inventory Book ${stamp}`, serialNumber: serial, copies: 3 });
    const copies = await prisma.bookCopy.findMany({ where: { bookId: book.body.data.id }, orderBy: { barcode: "asc" } });
    expect(copies).toHaveLength(3);
    await prisma.bookCopy.update({ where: { id: copies[2]!.id }, data: { status: "LOST" } });

    const start = await request(app).post("/api/v1/inventory/audits").set(auth()).send({ note: "Test audit" });
    expect(start.status).toBe(201);
    const id = start.body.data.id as string;
    expect((await request(app).post("/api/v1/inventory/audits").set(auth()).send({})).status).toBe(409);

    const scan = (code: string) => request(app).post(`/api/v1/inventory/audits/${id}/scan`).set(auth()).send({ code });
    const first = await scan(copies[0]!.barcode.toLowerCase()); // typed in lower case
    expect(first.status).toBe(200);
    expect(first.body.data.alreadyScanned).toBe(false);
    expect((await scan(copies[0]!.barcode)).body.data.alreadyScanned).toBe(true);
    const lost = await scan(copies[2]!.barcode);
    expect(lost.body.data.warning).toMatch(/lost/);
    expect((await scan("NO-SUCH-COPY-99")).status).toBe(404);

    const r = (await request(app).get(`/api/v1/inventory/audits/${id}`).set(auth())).body.data;
    expect(r.scans).toHaveLength(2);
    const notFound = r.notFound.map((c: { id: string }) => c.id);
    expect(notFound).toContain(copies[1]!.id);
    expect(notFound).not.toContain(copies[0]!.id);
    expect(r.mismatched.map((c: { id: string }) => c.id)).toEqual([copies[2]!.id]);
    // Statuses are only reported, never changed.
    expect((await prisma.bookCopy.findUnique({ where: { id: copies[2]!.id } }))!.status).toBe("LOST");
    expect((await prisma.bookCopy.findUnique({ where: { id: copies[0]!.id } }))!.lastVerifiedAt).not.toBeNull();

    const xlsx = await request(app).get(`/api/v1/inventory/audits/${id}/export.xlsx`).set(auth());
    expect(xlsx.status).toBe(200);
    expect((await request(app).post(`/api/v1/inventory/audits/${id}/close`).set(auth())).body.data.totals.scanned).toBe(2);
    expect((await scan(copies[1]!.barcode)).status).toBe(409);
  });
});
