import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { signToken } from "../src/modules/auth/auth.service.js";
import { env } from "../src/config/env.js";

// Any database use fails the test: requests below must be stopped by auth/validation before reaching Prisma.
const touched: string[] = [];
const prismaGuard: any = new Proxy({}, { get: (_t, model: string) => new Proxy({}, { get: (_m, op: string) => vi.fn(async () => { touched.push(`${model}.${op}`); throw new Error(`DB touched: ${model}.${op}`); }) }) });
const txs = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };
vi.doMock("../src/config/prisma.js", () => ({ prisma: new Proxy(prismaGuard, { get: (t, k: string) => (k === "borrowingTransaction" ? txs : t[k]) }), disconnectPrisma: vi.fn() }));
// The session check is covered by tests/session.test.ts (real database); here the token is trusted as signed.
vi.doMock("../src/middleware/session.js", () => ({ loadSession: async (c: any) => ({ id: c.id, username: c.username, role: c.role, permissions: c.permissions }) }));

const ID = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
// Staff-only endpoints: [method, path, body]
const STAFF: [string, string, object?][] = [
  ["get", "/api/v1/users"], ["get", "/api/v1/users/cards"], ["post", "/api/v1/users/cards/printed", { ids: [ID] }], ["post", "/api/v1/users", { username: "abc", password: "Library-Pass-2026", displayName: "A", memberType: "Student" }],
  ["patch", `/api/v1/users/${ID}`, { displayName: "X" }], ["patch", `/api/v1/users/${ID}/status`, { isActive: false }],
  ["get", "/api/v1/reports/summary"], ["get", "/api/v1/reports/this-week"], ["get", "/api/v1/reports/statistics"], ["get", "/api/v1/reports/recent-activity"], ["get", "/api/v1/reports/overdue"],
  ["post", "/api/v1/catalog", { title: "T" }], ["delete", `/api/v1/catalog/${ID}`],
  ["get", "/api/v1/catalog/export.xlsx"], ["get", "/api/v1/catalog/import-template.xlsx"], ["post", "/api/v1/catalog/import/preview"], ["post", "/api/v1/catalog/import/apply", { token: "x".repeat(20) }],
  ["patch", `/api/v1/catalog/${ID}`, { isHidden: false }],
  ["get", "/api/v1/book-copies"], ["post", "/api/v1/book-copies", { bookId: ID }], ["delete", `/api/v1/book-copies/${ID}`],
  ["post", "/api/v1/categories", { name: "N", kind: "GENRE" }],
  ["post", "/api/v1/circulation/return", { transactionId: ID, outcome: "RETURNED_ON_TIME" }],
  ["get", "/api/v1/borrow-requests?status=PENDING"], ["post", `/api/v1/borrow-requests/${ID}/approve`, {}], ["post", `/api/v1/borrow-requests/${ID}/reject`, {}],
  ["post", "/api/v1/notifications/overdue", { transactionId: ID }], ["post", "/api/v1/notifications/reminder", { transactionId: ID }],
  ["post", "/api/v1/backup/download", { currentPassword: "x" }], ["get", "/api/v1/backup/files"], ["get", "/api/v1/system/status"], ["post", "/api/v1/inventory/audits", {}], ["post", "/api/v1/visits/kiosk/start"], ["post", "/api/v1/visits/scan", { memberCode: "CA123456" }], ["get", "/api/v1/visits/today"], ["get", "/api/v1/visits/kiosk/qr"], ["get", "/api/v1/time/summary"], ["get", "/api/v1/suggestions"], ["get", "/api/v1/catalog/reviews"], ["patch", `/api/v1/catalog/reviews/${ID}`, { status: "APPROVED" }], ["patch", `/api/v1/suggestions/${ID}`, { status: "DONE" }], ["get", `/api/v1/time/members/${ID}`], ["post", `/api/v1/inventory/audits/${ID}/scan`, { code: "X-01" }], ["post", "/api/v1/backup/restore"],
  ["post", "/api/v1/backup/files/auto-2026-11-24-0200.sql.gz/restore", { currentPassword: "x", confirm: "RESTORE" }],
];
// Signed-in (any role) endpoints.
const SIGNED_IN: [string, string][] = [["get", "/api/v1/auth/me"], ["post", "/api/v1/auth/password-code"], ["get", "/api/v1/borrow-requests/mine"], ["get", "/api/v1/notifications/mine"], ["get", "/api/v1/favourites/mine"], ["patch", "/api/v1/auth/profile"]];

describe("API security", () => {
  let app: any;
  let member: string;
  beforeAll(async () => {
    app = (await import("../src/app.js")).createApp();
    member = signToken({ id: "m1", username: "member", role: "MEMBER", permissions: ["catalog:read", "categories:read"] });
  });
  const call = (m: string, p: string, token?: string, body?: object) => {
    const r = (request(app) as any)[m](p);
    if (token) r.set("Authorization", `Bearer ${token}`);
    return body ? r.send(body) : r;
  };

  it("every staff and member endpoint rejects requests without a token (401)", async () => {
    for (const [m, p, b] of [...STAFF, ...SIGNED_IN.map(([m, p]) => [m, p] as [string, string])]) {
      const res = await call(m, p, undefined, b);
      expect(res.status, `${m.toUpperCase()} ${p}`).toBe(401);
    }
    expect(touched).toEqual([]);
  });

  it("forged, unsigned and expired tokens are rejected (401)", async () => {
    const payload = { sub: "x", id: "x", username: "x", role: "ADMIN", permissions: ["*"] };
    const forged = jwt.sign(payload, "not-the-server-secret");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.`;
    const expired = jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, env.JWT_SECRET);
    for (const t of [forged, none, expired, "garbage"]) expect((await call("get", "/api/v1/users", t)).status).toBe(401);
    expect(touched).toEqual([]);
  });

  it("a member token cannot use any staff endpoint (403)", async () => {
    for (const [m, p, b] of STAFF) {
      const res = await call(m, p, member, b);
      expect(res.status, `${m.toUpperCase()} ${p}`).toBe(403);
    }
    expect(touched).toEqual([]);
  });

  it("a member only ever sees their own transactions, even when asking for someone else's", async () => {
    const res = await call("get", "/api/v1/circulation/transactions?borrowerId=someone-else", member);
    expect(res.status).toBe(200);
    expect(txs.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ borrowerId: "m1" }) }));
  });

  it("rejects malformed ids and payloads before the database", async () => {
    const staff = signToken({ id: "s1", username: "lib", role: "LIBRARIAN", permissions: ["users:write", "catalog:write"] });
    expect((await call("patch", "/api/v1/users/1%20OR%201=1/status", staff, { isActive: false })).status).toBe(400);
    expect((await call("post", "/api/v1/users", staff, { username: "x'; DROP TABLE User;--", password: "Library-Pass-2026", displayName: "A", memberType: "Student" })).status).toBe(400);
    expect((await call("post", "/api/v1/users", staff, { username: "valid_name", password: "weak", displayName: "A", memberType: "Student" })).status).toBe(400);
    expect(touched).toEqual([]);
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("CORS answers only the apps, CORS_ORIGINS and (outside production) the local network", async () => {
    const pre = (origin: string) => request(app).options("/api/v1/catalog").set("Origin", origin).set("Access-Control-Request-Method", "GET");
    for (const ok of ["capacitor://localhost", "http://tauri.localhost", "http://localhost:5173", "http://192.168.1.4:5173"]) {
      expect((await pre(ok)).headers["access-control-allow-origin"]).toBe(ok);
    }
    for (const bad of ["https://evil.example", "http://192.168.1.4.evil.example", "null"]) {
      expect((await pre(bad)).headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
});
