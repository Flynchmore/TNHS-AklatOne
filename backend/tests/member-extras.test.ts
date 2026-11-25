// Integration test (real database aklatone_e2e): "Notify me when available", written reviews with approval, reading goal.
// Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

async function oneCopyBook() {
  const serial = `XTR-${stamp % 1e8}-${Math.floor(Math.random() * 1e4)}`;
  const b = await request(app).post("/api/v1/catalog").set(as(admin)).send({ title: `Extras Book ${serial}`, serialNumber: serial, copies: 1 });
  const copy = await prisma.bookCopy.findFirstOrThrow({ where: { bookId: b.body.data.id } });
  return { id: b.body.data.id as string, code: copy.barcode };
}

describe("member extras", () => {
  beforeAll(async () => { admin = await adminToken(app); });

  it("notifies a waiting member once when the borrowed copy comes back", async () => {
    const book = await oneCopyBook();
    const reader = await newMember(app, `xtr_r_${stamp}`);
    const waiter = await newMember(app, `xtr_w_${stamp}`);
    expect((await request(app).put(`/api/v1/catalog/${book.id}/watch`).set(as(waiter.token))).status).toBe(409); // copy on the shelf
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).maskedId!;
    expect((await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ memberCode: code, copyCode: book.code })).status).toBe(201);

    expect((await request(app).put(`/api/v1/catalog/${book.id}/watch`).set(as(waiter.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/catalog/${book.id}`).set(as(waiter.token))).body.data.watching).toBe(true);
    expect((await request(app).put(`/api/v1/catalog/${book.id}/watch`).set(as(admin))).status).toBe(403);

    expect((await request(app).post("/api/v1/circulation/return").set(as(admin)).send({ copyCode: book.code })).status).toBe(200);
    await expect.poll(() => prisma.notification.count({ where: { userId: waiter.id, type: "BOOK_AVAILABLE" } })).toBe(1);
    expect(await prisma.bookWatch.count({ where: { userId: waiter.id } })).toBe(0);
  });

  it("shows a written review to others only after the librarian approves it", async () => {
    const book = await oneCopyBook();
    const m = await newMember(app, `xtr_v_${stamp}`, { displayName: "Juan Dela Cruz" });
    const code = (await prisma.user.findUniqueOrThrow({ where: { id: m.id } })).maskedId!;
    await request(app).post("/api/v1/circulation/borrow").set(as(admin)).send({ memberCode: code, copyCode: book.code });
    const rated = await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(as(m.token)).send({ stars: 5, review: "Great <b>story</b> for Grade 10." });
    expect(rated.status).toBe(200);
    const reviews = () => request(app).get(`/api/v1/catalog/${book.id}/reviews`).set(as(m.token));
    expect((await reviews()).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/v1/catalog/${book.id}`).set(as(m.token))).body.data.myReview).toMatchObject({ status: "PENDING" });

    const queue = await request(app).get("/api/v1/catalog/reviews").set(as(admin));
    const row = queue.body.data.items.find((r: { book: { id: string } }) => r.book.id === book.id);
    expect(queue.body.data.pending).toBeGreaterThan(0);
    expect((await request(app).patch(`/api/v1/catalog/reviews/${row.id}`).set(as(m.token)).send({ status: "APPROVED" })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/catalog/reviews/${row.id}`).set(as(admin)).send({ status: "APPROVED" })).status).toBe(200);
    expect((await reviews()).body.data[0]).toMatchObject({ name: "Juan", stars: 5, review: "Great <b>story</b> for Grade 10." });

    // Editing the review sends it back for approval.
    await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(as(m.token)).send({ stars: 4, review: "Changed my mind." });
    expect((await reviews()).body.data).toHaveLength(0);
  });

  it("finds a book from a copy QR label code", async () => {
    const book = await oneCopyBook();
    const m = await newMember(app, `xtr_q_${stamp}`);
    expect((await request(app).get(`/api/v1/catalog/by-copy/${book.code.toLowerCase()}`).set(as(m.token))).body.data.bookId).toBe(book.id);
    expect((await request(app).get("/api/v1/catalog/by-copy/NOPE-99").set(as(m.token))).status).toBe(404);
  });

  it("saves and clears a monthly reading goal", async () => {
    const m = await newMember(app, `xtr_g_${stamp}`);
    expect((await request(app).patch("/api/v1/auth/profile").set(as(m.token)).send({ readingGoal: 4 })).status).toBe(200);
    expect((await request(app).get("/api/v1/auth/me").set(as(m.token))).body.data.readingGoal).toBe(4);
    expect((await request(app).patch("/api/v1/auth/profile").set(as(m.token)).send({ readingGoal: 99 })).status).toBe(400);
    await request(app).patch("/api/v1/auth/profile").set(as(m.token)).send({ readingGoal: null });
    expect((await request(app).get("/api/v1/auth/me").set(as(m.token))).body.data.readingGoal).toBeNull();
  });
});
