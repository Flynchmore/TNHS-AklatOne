import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import { signToken } from "../src/modules/auth/auth.service.js";

const mockPrisma = {
  book: { findUnique: vi.fn() },
  bookCopy: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};

vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));

describe("book copies (mocked)", () => {
  let app: any;
  let token: string;

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    app = appMod.createApp();
    token = signToken({ id: "u1", username: "admin", role: "ADMIN", permissions: ["*"] });
  });

  it("lists copies", async () => {
    mockPrisma.bookCopy.findMany.mockResolvedValue([]);
    mockPrisma.bookCopy.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/book-copies").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it("creates copy with audit", async () => {
    mockPrisma.book.findUnique.mockResolvedValue({ id: "b1" });
    mockPrisma.bookCopy.create.mockResolvedValue({ id: "c1", barcode: "BC1", status: "AVAILABLE" });
    mockPrisma.auditLog.create.mockResolvedValue({});
    const res = await request(app).post("/api/v1/book-copies").set("Authorization", `Bearer ${token}`).send({ bookId: "clxxxxxxxxxxxxxxxxxxxxxxxxx", barcode: "BC1" });
    expect(res.status).toBe(201);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("generates the next free copy code from the serial (or ISBN) when none is given", async () => {
    mockPrisma.book.findUnique.mockResolvedValue({ id: "b1", serialNumber: "NMT-001", isbn: "9789710000000" });
    mockPrisma.bookCopy.count.mockResolvedValue(2);
    // NMT-001-03 is taken (e.g. a copy was deleted and re-added), so NMT-001-04 is used.
    mockPrisma.bookCopy.findUnique.mockImplementation(async ({ where }: any) => (where.barcode === "NMT-001-03" ? { id: "x" } : null));
    mockPrisma.bookCopy.create.mockImplementation(async ({ data }: any) => ({ id: "c2", status: "AVAILABLE", ...data }));
    mockPrisma.auditLog.create.mockResolvedValue({});
    const res = await request(app).post("/api/v1/book-copies").set("Authorization", `Bearer ${token}`).send({ bookId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(res.status).toBe(201);
    expect(res.body.data.barcode).toBe("NMT-001-04");
    mockPrisma.bookCopy.findUnique.mockReset();
  });

  it("invalid payload returns 400", async () => {
    const res = await request(app).post("/api/v1/book-copies").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it("missing book returns 404", async () => {
    mockPrisma.book.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/v1/book-copies").set("Authorization", `Bearer ${token}`).send({ bookId: "clxxxxxxxxxxxxxxxxxxxxxxxxx", barcode: "BC2" });
    expect(res.status).toBe(404);
  });

  it("invalid status transition returns 409", async () => {
    mockPrisma.bookCopy.findUnique.mockResolvedValue({ id: "c1", status: "BORROWED" });
    const res = await request(app).patch("/api/v1/book-copies/clxxxxxxxxxxxxxxxxxxxxxxxxx/status").set("Authorization", `Bearer ${token}`).send({ status: "AVAILABLE" });
    expect(res.status).toBe(409);
  });

  it("member cannot create copy", async () => {
    const memberToken = signToken({ id: "m1", username: "member", role: "MEMBER", permissions: ["catalog:read"] });
    const res = await request(app).post("/api/v1/book-copies").set("Authorization", `Bearer ${memberToken}`).send({ bookId: "clxxxxxxxxxxxxxxxxxxxxxxxxx", barcode: "BC3" });
    expect(res.status).toBe(403);
  });

  it("unauthorized returns 401", async () => {
    const res = await request(app).get("/api/v1/book-copies");
    expect(res.status).toBe(401);
  });
});