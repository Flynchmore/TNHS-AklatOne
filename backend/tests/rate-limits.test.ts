import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const mockPrisma = { category: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) }, user: { findFirst: vi.fn(async () => null) } };
vi.doMock("../src/config/prisma.js", () => ({ prisma: mockPrisma, disconnectPrisma: vi.fn() }));

// Every request below comes from the same IP, like a whole school on one Wi-Fi.
describe("rate limits on a shared school IP", () => {
  let app: any;
  let env: { GLOBAL_RATE_LIMIT_MAX: number; ANON_RATE_LIMIT_MAX: number; STAFF_RATE_LIMIT_MAX: number };
  let saved: [number, number, number];
  let token: (id: string, role?: string) => string;
  beforeAll(async () => {
    env = (await import("../src/config/env.js")).env as never;
    saved = [env.GLOBAL_RATE_LIMIT_MAX, env.ANON_RATE_LIMIT_MAX, env.STAFF_RATE_LIMIT_MAX];
    env.GLOBAL_RATE_LIMIT_MAX = 3;
    env.ANON_RATE_LIMIT_MAX = 5;
    env.STAFF_RATE_LIMIT_MAX = 8;
    const { signToken } = await import("../src/modules/auth/auth.service.js");
    token = (id, role = "MEMBER") => signToken({ id, username: id, role, permissions: [] });
    app = (await import("../src/app.js")).createApp();
  });
  afterAll(() => { [env.GLOBAL_RATE_LIMIT_MAX, env.ANON_RATE_LIMIT_MAX, env.STAFF_RATE_LIMIT_MAX] = saved; });

  const get = (t?: string) => { const r = request(app).get("/api/v1/categories"); return t ? r.set("Authorization", `Bearer ${t}`) : r; };

  it("counts signed-in requests per account, so one busy student does not block the others", async () => {
    const a = token("member-a"), b = token("member-b");
    for (let i = 0; i < 3; i++) expect((await get(a)).status).toBe(200);
    expect((await get(a)).status).toBe(429);
    expect((await get(b)).status).toBe(200);
  });

  it("gives the librarian a higher limit (offline uploads send many requests in a row)", async () => {
    const lib = token("librarian-1", "LIBRARIAN");
    for (let i = 0; i < 8; i++) expect((await get(lib)).status).toBe(200);
    expect((await get(lib)).status).toBe(429);
  });

  it("counts requests without a token per IP, with their own (school-sized) limit", async () => {
    for (let i = 0; i < 5; i++) expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
    // A forged token does not get its own bucket.
    expect((await get("not-a-real-token")).status).toBe(429);
  });

  it("allows only 10 wrong password-reset codes per email, whatever the IP", async () => {
    const tryCode = (email: string) => request(app).post("/api/v1/auth/verify-otp").send({ email, otp: "123456" });
    for (let i = 0; i < 10; i++) expect((await tryCode("victim@example.com")).status).toBe(400);
    expect((await tryCode("victim@example.com")).status).toBe(429);
    // Another member resetting at the same time is not blocked.
    expect((await tryCode("someone.else@example.com")).status).toBe(400);
  });
});
