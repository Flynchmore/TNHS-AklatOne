// Real database (aklatone_e2e): the library's emergency recovery key. Fictional records only; no real email is sent.
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, signIn } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const PW = "Recovery#Pass2026";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const librarian = (n: string) => ({ name: "Maria Santos", position: "School Librarian", department: "Library", email: `recover_${n}_${stamp}@example.test`, password: PW });

describe("librarian recovery key", () => {
  // The e2e database keeps its own librarians as they were before this test.
  let before: { id: string; username: string; email: string | null; isActive: boolean }[] = [];

  it("makes a new key only after the password is entered again, then the key replaces the librarian account", async () => {
    before = await prisma.user.findMany({ where: { role: { name: "LIBRARIAN" } }, select: { id: true, username: true, email: true, isActive: true } });
    const admin = await adminToken(app);
    expect((await request(app).post("/api/v1/setup/recovery-key").set(as(admin)).send({ currentPassword: "wrong" })).status).toBe(400);
    const made = await request(app).post("/api/v1/setup/recovery-key").set(as(admin)).send({ currentPassword: "TestPass123!" });
    expect(made.status).toBe(200);
    const key = made.body.data.recoveryKey as string;
    expect(key).toMatch(/^AKLT(-[A-Z2-9]{5}){5}$/);
    expect((await request(app).get("/api/v1/setup/recovery-key").set(as(admin))).body.data.createdAt).toBeTruthy();
    expect((await prisma.libraryRecovery.findUniqueOrThrow({ where: { id: 1 } })).keyHash).not.toContain(key.slice(5, 10));

    expect((await request(app).post("/api/v1/setup/recover").send({ ...librarian("bad"), recoveryKey: "AKLT-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA" })).status).toBe(400);
    // Typed in lower case without dashes still works; the old key is used up.
    const first = await request(app).post("/api/v1/setup/recover").send({ ...librarian("a"), recoveryKey: key.toLowerCase().replace(/-/g, " ") });
    expect(first.status).toBe(201);
    expect(first.body.data.recoveryKey).not.toBe(key);
    expect((await request(app).post("/api/v1/setup/recover").send({ ...librarian("b"), recoveryKey: key })).status).toBe(400);

    const newLib = await signIn(app, `recover_a_${stamp}@example.test`, PW);
    expect((await request(app).get("/api/v1/auth/me").set(as(newLib))).body.data.role).toBe("LIBRARIAN");
    expect(await prisma.user.count({ where: { role: { name: "LIBRARIAN" }, isActive: true } })).toBe(1);
  });

  afterAll(async () => {
    // Put the e2e librarians back and remove the test librarian, so other test files see the database as before.
    await prisma.user.updateMany({ where: { username: { startsWith: "recover_" } }, data: { isActive: false } });
    for (const b of before) await prisma.user.update({ where: { id: b.id }, data: { username: b.username, email: b.email, isActive: b.isActive } });
  });
});
