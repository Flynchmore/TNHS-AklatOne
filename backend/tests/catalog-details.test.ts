// Integration test (real database: aklatone_e2e). All records are fictional.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let admin = "";
const members: string[] = [];

describe("catalog details, serial numbers and ratings", () => {
  beforeAll(async () => {
    admin = (await request(app).post("/api/v1/auth/login").send({ username: "e2e_admin", password: "TestPass123!" })).body.data.token;
    for (const n of [1, 2]) {
      members.push((await newMember(app, `rate_member_${n}_${stamp}`)).token);
    }
  });

  it("librarian creates a book with details, serial number and copies", async () => {
    const serial = `ser-${String(stamp).slice(-6)}`;
    const res = await request(app).post("/api/v1/catalog").set(auth(admin)).send({
      title: `Fictional Classic ${stamp}`, authors: "A. Sample Writer", publisher: "Sample Press", publishedYear: 1999,
      serialNumber: serial, isbn: "", description: "A short fictional description.", copies: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.serialNumber).toBe(serial.toUpperCase());
    expect(res.body.data.isbn).toBeNull();

    const detail = await request(app).get(`/api/v1/catalog/${res.body.data.id}`);
    expect(detail.body.data).toMatchObject({ publisher: "Sample Press", publishedYear: 1999, description: "A short fictional description.", availability: { total: 3, available: 3 }, rating: { average: 0, count: 0 }, myRating: null });

    const copies = await request(app).get(`/api/v1/book-copies?bookId=${res.body.data.id}`).set(auth(admin));
    expect(copies.body.data.items.map((c: { barcode: string }) => c.barcode).sort()).toEqual([1, 2, 3].map(n => `${serial.toUpperCase()}-0${n}`));

    const dup = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: "Other", serialNumber: serial });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/already used/);

    const found = await request(app).get(`/api/v1/catalog?q=${serial.toUpperCase()}`);
    expect(found.body.data.total).toBe(1);
  });

  it("only members who borrowed a book can rate it; borrow count and once-a-day views are tracked", async () => {
    const book = (await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `Rated Book ${stamp}`, copies: 1 })).body.data;

    const before = await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(members[0]!)).send({ stars: 5 });
    expect(before.status).toBe(403);
    expect(before.body.message).toMatch(/after you have borrowed/);
    expect((await request(app).get(`/api/v1/catalog/${book.id}`).set(auth(members[0]!))).body.data.canRate).toBe(false);

    // Both members borrow the single copy in turn (request -> approve -> return).
    for (const m of members) {
      const reqId = (await request(app).post("/api/v1/borrow-requests").set(auth(m)).send({ bookId: book.id })).body.data.id;
      const loan = (await request(app).post(`/api/v1/borrow-requests/${reqId}/approve`).set(auth(admin)).send({})).body.data.transaction;
      expect((await request(app).post("/api/v1/circulation/return").set(auth(admin)).send({ transactionId: loan.id })).status).toBe(200);
    }

    const detail = (await request(app).get(`/api/v1/catalog/${book.id}`).set(auth(members[0]!))).body.data;
    expect(detail.canRate).toBe(true);
    expect(detail.borrowCount).toBe(2);

    expect((await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(members[0]!)).send({ stars: 5 })).status).toBe(200);
    expect((await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(members[1]!)).send({ stars: 2 })).status).toBe(200);
    const again = await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(members[1]!)).send({ stars: 4 });
    expect(again.body.data).toEqual({ myRating: 4, rating: { average: 4.5, count: 2 } });
    expect((await request(app).get(`/api/v1/catalog/${book.id}`).set(auth(members[0]!))).body.data.myRating).toBe(5);
    expect((await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(admin)).send({ stars: 3 })).status).toBe(403);
    expect((await request(app).put(`/api/v1/catalog/${book.id}/rating`).set(auth(members[0]!)).send({ stars: 6 })).status).toBe(400);

    const v1 = await request(app).post(`/api/v1/catalog/${book.id}/view`).set(auth(members[0]!));
    expect(v1.body.data).toEqual({ counted: true, viewCount: 1 });
    const v2 = await request(app).post(`/api/v1/catalog/${book.id}/view`).set(auth(members[0]!));
    expect(v2.body.data).toEqual({ counted: false, viewCount: 1 });
    expect((await request(app).post(`/api/v1/catalog/${book.id}/view`).set(auth(members[1]!))).body.data.viewCount).toBe(2);
    expect((await request(app).post(`/api/v1/catalog/${book.id}/view`).set(auth(admin))).status).toBe(403);
    expect((await request(app).get(`/api/v1/catalog/${book.id}`)).body.data.viewCount).toBe(2);
  });
});
