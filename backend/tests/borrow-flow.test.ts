// Integration test (real database: run with DATABASE_URL pointing at aklatone_e2e, seeded by `npm run reset:e2e`).
// All records are fictional.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { MAX_BOOKS_PER_MEMBER } from "../src/config/loanPolicy.js";
import { createApp } from "../src/app.js";
import { newMember, adminToken } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let admin = "";
let member = "";
const bookIds: string[] = [];

async function newBook(title: string) {
  const book = await request(app).post("/api/v1/catalog").set(auth(admin)).send({ title: `${title} ${stamp}`, authors: "Fictional Author" });
  expect(book.status).toBe(201);
  const copy = await request(app).post("/api/v1/book-copies").set(auth(admin)).send({ bookId: book.body.data.id, barcode: `FLOW-${stamp}-${bookIds.length}` });
  expect(copy.status).toBe(201);
  bookIds.push(book.body.data.id);
  return book.body.data.id as string;
}

describe("borrow request workflow", () => {
  beforeAll(async () => {
    admin = await adminToken(app);
    member = (await newMember(app, `flow_member_${stamp}`, { displayName: "Flow Testcase" })).token;
  });

  it("member requests, librarian approves with a receipt, member is notified, return as torn marks the copy damaged", async () => {
    const bookId = await newBook("Flow Book A");

    const req1 = await request(app).post("/api/v1/borrow-requests").set(auth(member)).send({ bookId });
    expect(req1.status).toBe(201);
    expect(req1.body.data.status).toBe("PENDING");

    expect((await request(app).post("/api/v1/borrow-requests").set(auth(member)).send({ bookId })).status).toBe(409); // duplicate
    expect((await request(app).post("/api/v1/borrow-requests").set(auth(admin)).send({ bookId })).status).toBe(403); // staff can't request

    const pending = await request(app).get("/api/v1/borrow-requests?status=PENDING").set(auth(admin));
    expect(pending.body.data.items.some((r: { id: string }) => r.id === req1.body.data.id)).toBe(true);

    const approved = await request(app).post(`/api/v1/borrow-requests/${req1.body.data.id}/approve`).set(auth(admin)).send({});
    expect(approved.status).toBe(200);
    const loan = approved.body.data.transaction;
    expect(approved.body.data.status).toBe("APPROVED");
    expect(loan.receiptNo).toMatch(/^AK-\d{8}-[0-9A-F]{6}$/);
    const days = (new Date(loan.dueAt).getTime() - new Date(loan.borrowedAt).getTime()) / 86400000;
    expect(Math.round(days)).toBe(7);

    expect((await request(app).post(`/api/v1/borrow-requests/${req1.body.data.id}/approve`).set(auth(admin)).send({})).status).toBe(409); // already reviewed
    expect((await request(app).post("/api/v1/borrow-requests").set(auth(member)).send({ bookId })).status).toBe(409); // no copy left

    expect((await request(app).post("/api/v1/notifications/overdue").set(auth(admin)).send({ transactionId: loan.id })).status).toBe(201);
    expect((await request(app).post("/api/v1/notifications/reminder").set(auth(admin)).send({ transactionId: loan.id, message: "Please bring it back by Friday." })).status).toBe(201);
    expect((await request(app).post("/api/v1/notifications/reminder").set(auth(admin)).send({ transactionId: loan.id })).status).toBe(201);
    expect((await request(app).post("/api/v1/notifications/reminder").set(auth(member)).send({ transactionId: loan.id })).status).toBe(403);
    const notes = await request(app).get("/api/v1/notifications/mine").set(auth(member));
    const types = notes.body.data.items.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(["REQUEST_APPROVED", "OVERDUE", "DUE_SOON"]));
    const reminders = notes.body.data.items.filter((n: { type: string }) => n.type === "DUE_SOON");
    expect(reminders.map((n: { message: string }) => n.message)).toEqual(expect.arrayContaining(["Please bring it back by Friday."]));
    expect(reminders.some((n: { title: string; message: string }) => n.title === "Return reminder" && n.message.startsWith("Reminder:"))).toBe(true);
    expect(notes.body.data.unread).toBeGreaterThanOrEqual(2);

    const receipt = await request(app).get(`/api/v1/circulation/transactions/${loan.id}`).set(auth(member));
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.receiptNo).toBe(loan.receiptNo);
    expect(receipt.body.data.bookCopy.book.title).toContain("Flow Book A");
    expect(receipt.body.data.bookCopy.book).toHaveProperty("serialNumber");
    expect(receipt.body.data.bookCopy.book).toHaveProperty("publisher");

    const ret = await request(app).post("/api/v1/circulation/return").set(auth(admin)).send({ transactionId: loan.id, outcome: "DAMAGED" });
    expect(ret.status).toBe(200);
    expect(ret.body.data.outcome).toBe("DAMAGED");
    expect((await request(app).post("/api/v1/notifications/reminder").set(auth(admin)).send({ transactionId: loan.id })).status).toBe(409);
    expect(ret.body.data.status).toBe("RETURNED");
    const copies = await request(app).get(`/api/v1/book-copies?bookId=${bookId}`).set(auth(admin));
    expect(copies.body.data.items[0].status).toBe("DAMAGED");

    // Member can hide the finished item from History; other members cannot.
    expect((await request(app).post(`/api/v1/borrow-requests/${req1.body.data.id}/hide`).set(auth(admin)).send({})).status).toBe(409);
    expect((await request(app).post(`/api/v1/borrow-requests/${req1.body.data.id}/hide`).set(auth(member)).send({})).status).toBe(200);
    const mine = await request(app).get("/api/v1/borrow-requests/mine").set(auth(member));
    expect(mine.body.data.items.some((r: { id: string }) => r.id === req1.body.data.id)).toBe(false);

    // Update alerts can be deleted; librarian notices cannot.
    const all = (await request(app).get("/api/v1/notifications/mine").set(auth(member))).body.data.items as { id: string; type: string }[];
    const update = all.find(n => n.type === "REQUEST_APPROVED")!;
    const notice = all.find(n => n.type === "OVERDUE")!;
    expect((await request(app).delete(`/api/v1/notifications/${notice.id}`).set(auth(member))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/notifications/${update.id}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/notifications/${update.id}`).set(auth(member))).status).toBe(200);
  });

  it("limits a member to MAX_BOOKS_PER_MEMBER books, and supports reject and cancel", async () => {
    const ids: string[] = [];
    for (let i = 0; i <= MAX_BOOKS_PER_MEMBER; i++) ids.push(await newBook(`Flow Book L${i}`));
    const made = [];
    for (const bookId of ids.slice(0, MAX_BOOKS_PER_MEMBER)) {
      const r = await request(app).post("/api/v1/borrow-requests").set(auth(member)).send({ bookId });
      expect(r.status).toBe(201);
      made.push(r.body.data.id);
    }
    const oneTooMany = await request(app).post("/api/v1/borrow-requests").set(auth(member)).send({ bookId: ids[MAX_BOOKS_PER_MEMBER] });
    expect(oneTooMany.status).toBe(409);
    expect(oneTooMany.body.message).toMatch(new RegExp(`at most ${MAX_BOOKS_PER_MEMBER}`));

    const rejected = await request(app).post(`/api/v1/borrow-requests/${made[0]}/reject`).set(auth(admin)).send({ note: "Reserved for class use" });
    expect(rejected.body.data.status).toBe("REJECTED");
    expect((await request(app).post(`/api/v1/borrow-requests/${made[2]}/hide`).set(auth(member)).send({})).status).toBe(409); // still pending
    const cancelled = await request(app).post(`/api/v1/borrow-requests/${made[1]}/cancel`).set(auth(member)).send({});
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const mine = await request(app).get("/api/v1/borrow-requests/mine").set(auth(member));
    expect(mine.body.data.policy).toEqual({ loanDays: 7, maxBooks: 8 });
    const notes = await request(app).get("/api/v1/notifications/mine").set(auth(member));
    expect(notes.body.data.items.some((n: { type: string; message: string }) => n.type === "REQUEST_REJECTED" && n.message.includes("Reserved for class use"))).toBe(true);
  });
});
