// Integration test (real database aklatone_e2e): lending at the library desk. Fictional records only.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { MAX_BOOKS_PER_MEMBER } from "../src/config/loanPolicy.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { adminToken, newMember } from "./helpers.js";

const app = createApp();
const stamp = Date.now();
let admin = "";
const auth = () => ({ Authorization: `Bearer ${admin}` });
const lend = (body: object) => request(app).post("/api/v1/circulation/borrow").set(auth()).send(body);

async function bookWithCopies(n: number) {
  const serial = `DSK-${stamp % 1e8}-${Math.floor(Math.random() * 1e4)}`;
  const b = await request(app).post("/api/v1/catalog").set(auth()).send({ title: `Desk Book ${serial}`, serialNumber: serial, copies: n });
  const copies = await prisma.bookCopy.findMany({ where: { bookId: b.body.data.id }, orderBy: { barcode: "asc" } });
  return { id: b.body.data.id as string, codes: copies.map((c) => c.barcode) };
}

describe("lending at the desk", () => {
  beforeAll(async () => { admin = await adminToken(app); });

  it("lends by Member ID card + copy QR code, with a receipt, due date, alert and the copy marked borrowed", async () => {
    const m = await newMember(app, `desk_a_${stamp}`, { displayName: "Desk Testcase" });
    const code = (await prisma.user.findUnique({ where: { id: m.id } }))!.maskedId!;
    const book = await bookWithCopies(2);
    const r = await lend({ memberCode: code.toLowerCase(), copyCode: book.codes[0]!.toLowerCase() }); // typed in lower case
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ status: "ACTIVE", borrower: { id: m.id, maskedId: code }, bookCopy: { barcode: book.codes[0]! } });
    expect(r.body.data.receiptNo).toMatch(/^AK-\d{8}-[0-9A-F]{6}$/);
    const days = (new Date(r.body.data.dueAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await prisma.bookCopy.findFirst({ where: { barcode: book.codes[0]! } }))!.status).toBe("BORROWED");
    expect(await prisma.notification.count({ where: { userId: m.id, type: "BOOK_BORROWED" } })).toBe(1);
    // The member sees the loan in their own app.
    const mine = await request(app).get("/api/v1/circulation/transactions").set("Authorization", `Bearer ${m.token}`);
    expect(mine.body.data.items.map((t: { id: string }) => t.id)).toContain(r.body.data.id);
  });

  it("lends by picking the book in the catalog (first copy on the shelf), and refuses when none is left", async () => {
    const m = await newMember(app, `desk_b_${stamp}`);
    const book = await bookWithCopies(1);
    expect((await lend({ borrowerId: m.id, bookId: book.id })).status).toBe(201);
    const none = await lend({ borrowerId: m.id, bookId: book.id });
    expect(none.status).toBe(409);
    expect(none.body.message).toMatch(/No copy of this book is on the shelf/);
  });

  it("the same copy can never be lent twice (two desks, or an offline upload)", async () => {
    const [a, b] = [await newMember(app, `desk_c_${stamp}`), await newMember(app, `desk_d_${stamp}`)];
    const book = await bookWithCopies(1);
    const results = await Promise.all([lend({ borrowerId: a.id, copyCode: book.codes[0] }), lend({ borrowerId: b.id, copyCode: book.codes[0] })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.borrowingTransaction.count({ where: { bookCopy: { barcode: book.codes[0]! } } })).toBe(1);
  });

  it("explains unknown Member IDs and copy codes, and enforces the book limit", async () => {
    const m = await newMember(app, `desk_e_${stamp}`);
    const book = await bookWithCopies(MAX_BOOKS_PER_MEMBER + 1);
    expect((await lend({ memberCode: "ZZ000000", copyCode: book.codes[0] })).body.message).toMatch(/No member has the Member ID ZZ000000/);
    const unknown = await lend({ borrowerId: m.id, copyCode: "NOT-IN-AKLATONE-1" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.message).toMatch(/add it in Catalog first/);
    expect((await lend({ memberCode: "12345", copyCode: book.codes[0] })).status).toBe(400);
    for (const c of book.codes.slice(0, MAX_BOOKS_PER_MEMBER)) expect((await lend({ borrowerId: m.id, copyCode: c })).status).toBe(201);
    const oneTooMany = await lend({ borrowerId: m.id, copyCode: book.codes[MAX_BOOKS_PER_MEMBER] });
    expect(oneTooMany.status).toBe(409);
    expect(oneTooMany.body.message).toMatch(new RegExp(`limit is ${MAX_BOOKS_PER_MEMBER}`));
  });

  it("returns a book by scanning its QR label (copy code)", async () => {
    const m = await newMember(app, `desk_ret_${stamp}`);
    const book = await bookWithCopies(1);
    expect((await lend({ borrowerId: m.id, copyCode: book.codes[0] })).status).toBe(201);
    const r = await request(app).post("/api/v1/circulation/return").set(auth()).send({ copyCode: book.codes[0]!.toLowerCase(), outcome: "RETURNED_ON_TIME" });
    expect(r.status).toBe(200);
    expect((await prisma.bookCopy.findFirst({ where: { barcode: book.codes[0]! } }))!.status).toBe("AVAILABLE");
    const again = await request(app).post("/api/v1/circulation/return").set(auth()).send({ copyCode: book.codes[0] });
    expect(again.status).toBe(404);
    expect(again.body.message).toMatch(/is not borrowed right now/);
    expect((await request(app).post("/api/v1/circulation/return").set(auth()).send({})).status).toBe(400);
  });
});
