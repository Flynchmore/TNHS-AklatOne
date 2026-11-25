import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import { signToken } from "../src/modules/auth/auth.service.js";

const mockPrisma = {
  suggestion: { count: vi.fn(async () => 0) },
  book: { count: vi.fn() },
  bookCopy: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  borrowingTransaction: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn(), findMany: vi.fn() },
  user: { count: vi.fn() },
  borrowRequest: { count: vi.fn() },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};

vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));

describe("reports (mocked)", () => {
  let app: any;
  let token: string;

  beforeAll(async () => {
    const appMod = await import("../src/app.js");
    app = appMod.createApp();
    token = signToken({ id: "u1", username: "admin", role: "ADMIN", permissions: ["*"] });
  });

  it("summary", async () => {
    mockPrisma.book.count.mockResolvedValue(10);
    mockPrisma.bookCopy.count.mockResolvedValue(20);
    // active, returned, overdue, due this week
    mockPrisma.borrowingTransaction.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockPrisma.user.count.mockResolvedValue(42);
    mockPrisma.borrowRequest.count.mockResolvedValue(4);
    const res = await request(app).get("/api/v1/reports/summary").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ titles: 10, activeLoans: 5, overdueLoans: 1, members: 42, dueThisWeek: 2, pendingRequests: 4 });
    expect(mockPrisma.user.count).toHaveBeenCalledWith({ where: { isActive: true, role: { name: "MEMBER" } } });
  });

  it("statistics groups loans by Philippine month, role and outcome", async () => {
    const { phMonth } = await import("../src/modules/reports/reports.routes.js");
    // 16:30 UTC on Nov 30 is already Dec 1 in Manila.
    expect(phMonth(new Date("2026-11-30T16:30:00Z"))).toBe("2026-12");
    expect(phMonth(new Date("2026-11-30T15:59:00Z"))).toBe("2026-11");
    const recent = new Date();
    mockPrisma.borrowingTransaction.findMany.mockResolvedValue([
      { borrowedAt: recent, status: "ACTIVE", outcome: null, borrower: { memberType: "Student" } },
      { borrowedAt: recent, status: "RETURNED", outcome: "RETURNED_LATE", borrower: { memberType: "Teacher" } },
      { borrowedAt: recent, status: "RETURNED", outcome: "RETURNED_ON_TIME", borrower: { memberType: "Student" } },
    ]);
    const res = await request(app).get("/api/v1/reports/statistics").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.monthly).toHaveLength(12);
    expect(res.body.data.monthly.at(-1)).toEqual({ month: phMonth(recent), count: 3 });
    expect(res.body.data.byRole).toMatchObject({ Student: 2, Teacher: 1 });
    expect(res.body.data.byOutcome).toEqual({ STILL_BORROWED: 1, RETURNED_LATE: 1, RETURNED_ON_TIME: 1 });
  });

  it("recent-activity returns the latest audit entries", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ id: "a1", action: "book.create", entityType: "Book", createdAt: new Date(), actor: { username: "lib", displayName: "Lib" } }]);
    const res = await request(app).get("/api/v1/reports/recent-activity?limit=5").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].action).toBe("book.create");
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, orderBy: { createdAt: "desc" } }));
  });

  it("copies-by-status", async () => {
    mockPrisma.bookCopy.groupBy.mockResolvedValue([{ status: "AVAILABLE", _count: { _all: 5 } }]);
    const res = await request(app).get("/api/v1/reports/copies-by-status").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe("AVAILABLE");
  });

  it("circulation", async () => {
    mockPrisma.borrowingTransaction.count.mockResolvedValue(5);
    const res = await request(app).get("/api/v1/reports/circulation").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(5);
  });

  it("popular-books", async () => {
    mockPrisma.borrowingTransaction.groupBy.mockResolvedValue([]);
    mockPrisma.bookCopy.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/v1/reports/popular-books").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it("overdue", async () => {
    mockPrisma.borrowingTransaction.findMany.mockResolvedValue([]);
    mockPrisma.borrowingTransaction.count.mockResolvedValue(0);
    const res = await request(app).get("/api/v1/reports/overdue").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it("member denied", async () => {
    const memberToken = signToken({ id: "m1", username: "member", role: "MEMBER", permissions: ["catalog:read"] });
    const res = await request(app).get("/api/v1/reports/summary").set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it("unauthorized returns 401", async () => {
    const res = await request(app).get("/api/v1/reports/summary");
    expect(res.status).toBe(401);
  });
});