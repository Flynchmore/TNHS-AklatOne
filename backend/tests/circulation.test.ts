import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import { signToken } from "../src/modules/auth/auth.service.js";

const mockPrisma = {
  bookCopy: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  borrowingTransaction: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  notification: { create: vi.fn() },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};

vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));
vi.doMock("../src/modules/catalog/watchers.js", () => ({ notifyWatchers: vi.fn(async () => 0) }));

describe("circulation (mocked)", () => {
  let app: any;
  let token: string;

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    app = appMod.createApp();
    token = signToken({ id: "u1", username: "admin", role: "ADMIN", permissions: ["*"] });
  });

  it("return success", async () => {
    mockPrisma.borrowingTransaction.findUnique.mockResolvedValueOnce({ id: "t1", status: "ACTIVE", bookCopyId: "c1", notes: null, bookCopy: { bookId: "b1", book: { title: "Test Book" } } });
    mockPrisma.borrowingTransaction.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.bookCopy.update.mockResolvedValue({});
    mockPrisma.borrowingTransaction.findUnique.mockResolvedValueOnce({ id: "t1", status: "RETURNED" });
    mockPrisma.auditLog.create.mockResolvedValue({});
    const res = await request(app).post("/api/v1/circulation/return").set("Authorization", `Bearer ${token}`).send({ transactionId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(res.status).toBe(200);
  });

  it("return already returned returns 409", async () => {
    mockPrisma.borrowingTransaction.findUnique.mockResolvedValue({ id: "t1", status: "RETURNED", bookCopyId: "c1" });
    const res = await request(app).post("/api/v1/circulation/return").set("Authorization", `Bearer ${token}`).send({ transactionId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(res.status).toBe(409);
  });

  it("unauthorized returns 401", async () => {
    // Lending itself is tested on the real database in tests/desk-lending.test.ts.
    const res = await request(app).post("/api/v1/circulation/borrow").send({ bookCopyId: "clxxxxxxxxxxxxxxxxxxxxxxxxx", borrowerId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" });
    expect(res.status).toBe(401);
  });
});