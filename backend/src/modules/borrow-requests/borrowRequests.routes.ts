import { phDay } from "../visits/visits.routes.js";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { idParamSchema } from "../../common/schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { notifyTx } from "../../common/notify.js";
import { borrowApprovedEmail, emailMember } from "../../common/email.js";
import { LOAN_DAYS, MAX_BOOKS_PER_MEMBER } from "../../config/loanPolicy.js";
import { approveSchema, createRequestSchema, listRequestsQuery, rejectSchema } from "./borrowRequests.schemas.js";

export const borrowRequestsRouter = Router();

const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });
// Local (server time zone) YYYY-MM-DD; toISOString would give the UTC date, a day early in the Philippines before 8 AM.
const fmtDate = (d: Date) => d.toLocaleDateString("en-CA");
/** Human-readable receipt number, e.g. AK-20261120-7F3A9C. */
export const newReceiptNo = (now = new Date()) => `AK-${fmtDate(now).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

const requestInclude = {
  book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true } },
  member: { select: { id: true, username: true, displayName: true, memberType: true, maskedId: true, gradeSection: true, department: true } },
  reviewedBy: { select: { id: true, username: true, displayName: true } },
  transaction: { select: { id: true, receiptNo: true, borrowedAt: true, dueAt: true, status: true, outcome: true, returnedAt: true, bookCopy: { select: { barcode: true } } } },
} as const;

// ---------- Member ----------

borrowRequestsRouter.post("/", authenticate, validate({ body: createRequestSchema }), async (req, res, next) => {
  try {
    if (req.user?.role !== "MEMBER") return fail(res, 403, "Only members can request to borrow books");
    const memberId = req.user.id;
    const { bookId, note, takenNow } = req.body as { bookId: string; note?: string; takenNow?: boolean };
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.isHidden) return fail(res, 404, "Book not found");
    if (takenNow) {
      // Only teachers, and only after a Time In today at the Visitor's Log (developer rule 2026-11-26).
      const me = await prisma.user.findUnique({ where: { id: memberId }, select: { memberType: true } });
      if (me?.memberType !== "Teacher") return fail(res, 403, "Only teachers can take a book while the librarian is away. Please wait for the librarian.");
      const inside = await prisma.libraryVisit.findFirst({ where: { memberId, day: phDay(new Date()), timeOut: null } });
      if (!inside) return fail(res, 409, "Time in at the Visitor's Log first, then send the request.");
    }

    const request = await prisma.$transaction(async (db) => {
      const [activeLoans, pending, duplicate, available] = await Promise.all([
        db.borrowingTransaction.count({ where: { borrowerId: memberId, status: "ACTIVE" } }),
        db.borrowRequest.count({ where: { memberId, status: "PENDING" } }),
        db.borrowRequest.findFirst({ where: { memberId, bookId, status: "PENDING" } }),
        db.bookCopy.count({ where: { bookId, status: "AVAILABLE" } }),
      ]);
      if (duplicate) throw conflict("You already have a pending request for this book.");
      if (activeLoans + pending >= MAX_BOOKS_PER_MEMBER) throw conflict(`You can have at most ${MAX_BOOKS_PER_MEMBER} books borrowed or requested at a time.`);
      if (available === 0) throw conflict("No copies of this book are available right now.");
      const r = await db.borrowRequest.create({ data: { bookId, memberId, note: note ?? null, takenNow: !!takenNow }, include: requestInclude });
      await writeAuditTx(db, { actorId: memberId, action: "borrowRequest.create", entityType: "BorrowRequest", entityId: r.id, metadata: { bookId, takenNow: !!takenNow } });
      return r;
    });
    created(res, request);
  } catch (err) { next(err); }
});

borrowRequestsRouter.get("/mine", authenticate, async (req, res, next) => {
  try {
    const items = await prisma.borrowRequest.findMany({ where: { memberId: req.user!.id, memberHiddenAt: null }, include: requestInclude, orderBy: { createdAt: "desc" }, take: 100 });
    ok(res, { items, policy: { loanDays: LOAN_DAYS, maxBooks: MAX_BOOKS_PER_MEMBER } });
  } catch (err) { next(err); }
});

borrowRequestsRouter.post("/:id/cancel", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const upd = await prisma.borrowRequest.updateMany({ where: { id, memberId: req.user!.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (upd.count === 0) return fail(res, 409, "Only your own pending requests can be cancelled");
    ok(res, await prisma.borrowRequest.findUnique({ where: { id }, include: requestInclude }), "Cancelled");
  } catch (err) { next(err); }
});

/** Member removes a finished item from their History. Only hidden from the member; the record stays for the library. */
borrowRequestsRouter.post("/:id/hide", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const upd = await prisma.borrowRequest.updateMany({
      where: {
        id, memberId: req.user!.id, memberHiddenAt: null,
        OR: [{ status: { in: ["REJECTED", "CANCELLED"] } }, { status: "APPROVED", transaction: { status: { not: "ACTIVE" } } }],
      },
      data: { memberHiddenAt: new Date() },
    });
    if (upd.count === 0) return fail(res, 409, "Only finished items in your History can be removed");
    ok(res, { hidden: true });
  } catch (err) { next(err); }
});

// ---------- Librarian ----------

borrowRequestsRouter.get("/", authenticate, requirePermission("circulation:read"), async (req, res, next) => {
  try {
    const parsed = listRequestsQuery.safeParse(req.query);
    const status = parsed.success ? parsed.data.status : undefined;
    const items = await prisma.borrowRequest.findMany({ where: status ? { status } : {}, include: requestInclude, orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, take: 200 });
    const bookIds = [...new Set(items.map(i => i.bookId))];
    const avail = await prisma.bookCopy.groupBy({ by: ["bookId"], where: { bookId: { in: bookIds }, status: "AVAILABLE" }, _count: { _all: true } });
    const availableByBook = Object.fromEntries(avail.map(a => [a.bookId, a._count._all]));
    ok(res, { items: items.map(i => ({ ...i, availableCopies: availableByBook[i.bookId] ?? 0 })) });
  } catch (err) { next(err); }
});

borrowRequestsRouter.post("/:id/approve", authenticate, requirePermission("circulation:write"), validate({ params: idParamSchema, body: approveSchema }), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { bookCopyId, note } = req.body as { bookCopyId?: string; note?: string };
    const reviewerId = req.user!.id;
    const result = await prisma.$transaction(async (db) => {
      const r = await db.borrowRequest.findUnique({ where: { id }, include: { book: true } });
      if (!r) throw Object.assign(new Error("Request not found"), { status: 404 });
      if (r.status !== "PENDING") throw conflict("This request has already been reviewed.");
      const copy = bookCopyId
        ? await db.bookCopy.findFirst({ where: { id: bookCopyId, bookId: r.bookId } })
        : await db.bookCopy.findFirst({ where: { bookId: r.bookId, status: "AVAILABLE" }, orderBy: { barcode: "asc" } });
      if (!copy) throw conflict("No available copy of this book to lend.");
      const taken = await db.bookCopy.updateMany({ where: { id: copy.id, status: "AVAILABLE" }, data: { status: "BORROWED" } });
      if (taken.count === 0) throw conflict("That copy is no longer available.");
      const now = new Date();
      const dueAt = new Date(now.getTime() + LOAN_DAYS * 86400000);
      const loan = await db.borrowingTransaction.create({ data: { bookCopyId: copy.id, borrowerId: r.memberId, dueAt, status: "ACTIVE", receiptNo: newReceiptNo(now), notes: note ?? null } });
      const claimed = await db.borrowRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: now, decisionNote: note ?? null, transactionId: loan.id } });
      if (claimed.count === 0) throw conflict("This request has already been reviewed.");
      await notifyTx(db, { userId: r.memberId, type: "REQUEST_APPROVED", title: "Borrow request approved", message: `Your request for "${r.book.title}" was approved. Receipt ${loan.receiptNo}. Please return it by ${fmtDate(dueAt)}.`, transactionId: loan.id, createdById: reviewerId });
      await writeAuditTx(db, { actorId: reviewerId, action: "borrowRequest.approve", entityType: "BorrowRequest", entityId: id, metadata: { transactionId: loan.id, bookCopyId: copy.id } });
      return db.borrowRequest.findUnique({ where: { id }, include: requestInclude });
    });
    // Best-effort email (the in-app alert is the record).
    void emailMember(result?.memberId, (m) => borrowApprovedEmail(m.displayName, result!.book, result!.transaction!.receiptNo!, result!.transaction!.dueAt!));
    ok(res, result, "Approved");
  } catch (err) { next(err); }
});

borrowRequestsRouter.post("/:id/reject", authenticate, requirePermission("circulation:write"), validate({ params: idParamSchema, body: rejectSchema }), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { note } = req.body as { note?: string };
    const reviewerId = req.user!.id;
    const result = await prisma.$transaction(async (db) => {
      const r = await db.borrowRequest.findUnique({ where: { id }, include: { book: true } });
      if (!r) throw Object.assign(new Error("Request not found"), { status: 404 });
      const upd = await db.borrowRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: new Date(), decisionNote: note ?? null } });
      if (upd.count === 0) throw conflict("This request has already been reviewed.");
      await notifyTx(db, { userId: r.memberId, type: "REQUEST_REJECTED", title: "Borrow request declined", message: `Your request for "${r.book.title}" was declined.${note ? ` Reason: ${note}` : ""}`, createdById: reviewerId });
      await writeAuditTx(db, { actorId: reviewerId, action: "borrowRequest.reject", entityType: "BorrowRequest", entityId: id });
      return db.borrowRequest.findUnique({ where: { id }, include: requestInclude });
    });
    ok(res, result, "Rejected");
  } catch (err) { next(err); }
});
