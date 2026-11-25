import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

const db = {
  $queryRaw: vi.fn(),
  user: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
};
const mockPrisma = { ...db, $transaction: vi.fn(async (cb: (d: typeof db) => unknown) => cb(db)) };
vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));

const good = { name: "Maria Santos", position: "School Librarian", department: "Library", email: "Librarian@Example.test", password: "Strong#Pass2026" };

describe("first-run librarian setup (mocked)", () => {
  let app: any;
  beforeAll(async () => { app = (await import("../src/app.js")).createApp(); });
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([{ id: "role-librarian" }]);
    db.user.count.mockResolvedValue(0);
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockImplementation(async ({ data }: any) => ({ id: "u1", ...data }));
  });

  it("reports that setup is needed when no librarian exists", async () => {
    const res = await request(app).get("/api/v1/setup/status");
    expect(res.body.data).toEqual({ needsLibrarianSetup: true });
  });

  it("ignores a deactivated (replaced) librarian", async () => {
    await request(app).get("/api/v1/setup/status");
    expect(db.user.count).toHaveBeenCalledWith({ where: { role: { name: "LIBRARIAN" }, isActive: true } });
  });

  it("creates the librarian with email as the sign-in name", async () => {
    const res = await request(app).post("/api/v1/setup/librarian").send(good);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ username: "librarian@example.test", displayName: "Maria Santos", position: "School Librarian", department: "Library" });
    const data = (db.user.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.roleId).toBe("role-librarian");
    expect(data.passwordHash).not.toBe(good.password);
  });

  it("refuses once a librarian exists (single shared account)", async () => {
    db.user.count.mockResolvedValue(1);
    const status = await request(app).get("/api/v1/setup/status");
    expect(status.body.data.needsLibrarianSetup).toBe(false);
    const res = await request(app).post("/api/v1/setup/librarian").send(good);
    expect(res.status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("rejects a weak password and missing fields", async () => {
    expect((await request(app).post("/api/v1/setup/librarian").send({ ...good, password: "password1" })).status).toBe(400);
    expect((await request(app).post("/api/v1/setup/librarian").send({ ...good, department: "" })).status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("rejects an email that already has an account", async () => {
    db.user.findFirst.mockResolvedValue({ id: "other" });
    const res = await request(app).post("/api/v1/setup/librarian").send(good);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/);
  });
});
