import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { signToken } from "../src/modules/auth/auth.service.js";

const mockPrisma = {
  borrowingTransaction: { groupBy: vi.fn(async () => []) },
  user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  role: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
};
vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));
const sendWelcomeEmail = vi.fn(async () => true);
vi.doMock("../src/common/email.js", async (orig) => ({ ...(await orig<object>()), sendWelcomeEmail }));

const member = { id: "m1", username: "juan", email: "juan@example.com", role: { name: "MEMBER" } };
const good = { username: "juan_c", password: "Library-Pass-2026", displayName: "Juan Cruz", memberType: "Student", email: "juan.c@example.com", studentRowNo: 12 };

describe("members (users) API", () => {
  let app: any;
  let writer: string;
  let reader: string;

  beforeAll(async () => {
    app = (await import("../src/app.js")).createApp();
    writer = signToken({ id: "lib1", username: "lib", role: "LIBRARIAN", permissions: ["users:read", "users:write"] });
    reader = signToken({ id: "lib2", username: "lib2", role: "LIBRARIAN", permissions: ["users:read"] });
  });
  beforeEach(() => vi.clearAllMocks());

  it("lists members only, with search and active-loan counts", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "m1", username: "juan", _count: { borrowed: 2 } }]);
    mockPrisma.user.count.mockResolvedValue(1);
    const res = await request(app).get("/api/v1/users?q=juan&memberType=Student&status=active").set("Authorization", `Bearer ${writer}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, items: [{ id: "m1", activeLoans: 2 }] });
    const where = mockPrisma.user.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ role: { name: "MEMBER" }, memberType: "Student", isActive: true });
    expect(where.OR).toHaveLength(5); // username, name, email, section, Member ID
  });

  it("creates a member, audits it and sends the welcome email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.role.findUnique.mockResolvedValue({ id: "r-member" });
    mockPrisma.user.create.mockResolvedValue({ id: "m2", username: "juan_c", displayName: "Juan Cruz", email: "juan.c@example.com", memberType: "Student" });
    const res = await request(app).post("/api/v1/users").set("Authorization", `Bearer ${writer}`).send(good);
    expect(res.status).toBe(201);
    const data = mockPrisma.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ username: "juan_c", roleId: "r-member", studentRowNo: 12, department: null, position: null });
    expect(data.password).toBeUndefined();
    expect(data.passwordHash).toMatch(/^\$2/);
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    expect(sendWelcomeEmail).toHaveBeenCalledWith("juan.c@example.com", "created", "Juan Cruz", "juan_c");
  });

  it("rejects weak passwords, duplicate usernames and missing write permission", async () => {
    expect((await request(app).post("/api/v1/users").set("Authorization", `Bearer ${writer}`).send({ ...good, password: "password" })).status).toBe(400);
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "x" });
    expect((await request(app).post("/api/v1/users").set("Authorization", `Bearer ${writer}`).send(good)).status).toBe(409);
    expect((await request(app).post("/api/v1/users").set("Authorization", `Bearer ${reader}`).send(good)).status).toBe(403);
  });

  it("edits and deactivates members, but never staff accounts", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(member);
    mockPrisma.user.update.mockResolvedValue({ ...member, displayName: "Juan D.", isActive: false });
    expect((await request(app).patch("/api/v1/users/cmwntdrzx0001oabr6orwmmyk").set("Authorization", `Bearer ${writer}`).send({ displayName: "Juan D.", memberType: "Teacher" })).status).toBe(200);
    expect(mockPrisma.user.update.mock.calls[0]![0].data).toMatchObject({ displayName: "Juan D.", studentRowNo: null, gradeSection: null });
    const off = await request(app).patch("/api/v1/users/cmwntdrzx0001oabr6orwmmyk/status").set("Authorization", `Bearer ${writer}`).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(mockPrisma.auditLog.create.mock.calls.at(-1)![0].data.action).toBe("user.deactivate");

    mockPrisma.user.findUnique.mockResolvedValue({ ...member, role: { name: "LIBRARIAN" } });
    expect((await request(app).patch("/api/v1/users/cmwntdrzx0001oabr6orwmmyk/status").set("Authorization", `Bearer ${writer}`).send({ isActive: false })).status).toBe(404);
  });
});
