import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { signToken } from "../src/modules/auth/auth.service.js";

const mockPrisma = {
  bookRating: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), aggregate: vi.fn() },
  bookCopy: { findMany: vi.fn().mockResolvedValue([]) },
  borrowingTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  book: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  category: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};

vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));

describe("catalog and categories (mocked)", () => {
  let app: any;
  let token: string;

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    app = appMod.createApp();
    const role = { id: "r1", name: "ADMIN", permissions: ["*"] };
    const user = { id: "u1", username: "admin", role };
    token = signToken({ id: user.id, username: user.username, role: "ADMIN", permissions: ["*"] });
  });

  it("public catalog listing", async () => {
    mockPrisma.book.findMany.mockResolvedValue([]);
    mockPrisma.book.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/catalog");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });

  it("catalog pagination boundaries", async () => {
    mockPrisma.book.findMany.mockResolvedValue([]);
    mockPrisma.book.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/catalog?limit=200&offset=-5");
    expect(res.status).toBe(200);
    expect(res.body.data.limit).toBe(100);
    expect(res.body.data.offset).toBe(0);
  });

  it("invalid catalog id returns 400", async () => {
    const res = await request(app).get("/api/v1/catalog/not-a-cuid");
    expect(res.status).toBe(400);
  });

  it("missing book returns 404", async () => {
    mockPrisma.book.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/v1/catalog/clxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(res.status).toBe(404);
  });

  it("unauthorized create returns 401", async () => {
    const res = await request(app).post("/api/v1/catalog").send({ title: "X" });
    expect(res.status).toBe(401);
  });

  it("member cannot create catalog book", async () => {
    const memberToken = signToken({ id: "m1", username: "member", role: "MEMBER", permissions: ["catalog:read"] });
    const res = await request(app).post("/api/v1/catalog").set("Authorization", `Bearer ${memberToken}`).send({ title: "X" });
    expect(res.status).toBe(403);
  });

  it("creates book with audit", async () => {
    mockPrisma.book.create.mockResolvedValue({ id: "b1", title: "T", categories: [] });
    mockPrisma.auditLog.create.mockResolvedValue({});
    const res = await request(app).post("/api/v1/catalog").set("Authorization", `Bearer ${token}`).send({ title: "T" });
    expect(res.status).toBe(201);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("invalid create payload returns 400", async () => {
    const res = await request(app).post("/api/v1/catalog").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it("category list", async () => {
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.category.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it("category create duplicate returns 409", async () => {
    const err: any = new Error("dup");
    err.code = "P2002";
    mockPrisma.category.create.mockRejectedValue(err);
    const res = await request(app).post("/api/v1/categories").set("Authorization", `Bearer ${token}`).send({ name: "Dup" });
    expect(res.status).toBe(409);
  });

  it("category invalid payload returns 400", async () => {
    const res = await request(app).post("/api/v1/categories").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
  });

  it("category missing returns 404", async () => {
    mockPrisma.category.findUnique.mockResolvedValue(null);
    const res = await request(app).get("/api/v1/categories/clxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(res.status).toBe(404);
  });

  it("category delete with books returns 409", async () => {
    const err: any = new Error("fk");
    err.code = "P2003";
    mockPrisma.category.delete.mockRejectedValue(err);
    const res = await request(app).delete("/api/v1/categories/clxxxxxxxxxxxxxxxxxxxxxxxxx").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});