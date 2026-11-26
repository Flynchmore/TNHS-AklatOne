import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { borrowSchema, returnSchema } from "./circulation.schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { notifyTx } from "../../common/notify.js";
import { bookReturnedEmail, borrowedAtDeskEmail, emailMember } from "../../common/email.js";
import { LOAN_DAYS, MAX_BOOKS_PER_MEMBER } from "../../config/loanPolicy.js";
import { newReceiptNo } from "../borrow-requests/borrowRequests.routes.js";
import type { z } from "zod";

const phDay = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { notifyWatchers } from "../catalog/watchers.js";

export const circulationRouter = Router();

circulationRouter.post("/borrow", authenticate, requirePermission("circulation:write"), validate({ body: borrowSchema }), async (req, res, next) => {
  try {
    const b = req.body as z.infer<typeof borrowSchema>;
    const borrower = b.borrowerId
      ? await prisma.user.findUnique({ where: { id: b.borrowerId }, include: { role: { select: { name: true } } } })
      : await prisma.user.findUnique({ where: { maskedId: b.memberCode! }, include: { role: { select: { name: true } } } });
    if (!borrower || borrower.role.name !== "MEMBER") return fail(res, 404, b.memberCode ? `No member has the Member ID ${b.memberCode}.` : "Borrower not found");
    if (!borrower.isActive) return fail(res, 409, "This member's account is deactivated.");

    let copy;
    if (b.bookId) {
      const book = await prisma.book.findUnique({ where: { id: b.bookId }, select: { id: true } });
      if (!book) return fail(res, 404, "Book not found");
      copy = await prisma.bookCopy.findFirst({ where: { bookId: b.bookId, status: "AVAILABLE" }, orderBy: { barcode: "asc" } });
      if (!copy) return fail(res, 409, "No copy of this book is on the shelf right now.");
    } else {
      // Copy codes are stored in upper case; a typed code may not be.
      copy = b.bookCopyId
        ? await prisma.bookCopy.findUnique({ where: { id: b.bookCopyId } })
        : await prisma.bookCopy.findFirst({ where: { OR: [{ barcode: b.copyCode! }, { barcode: b.copyCode!.toUpperCase() }] } });
      if (!copy) return fail(res, 404, b.copyCode ? `No copy has the code ${b.copyCode}. If the book is not in AklatOne yet, add it in Catalog first.` : "Copy not found");
    }

    const now = new Date();
    const dueAt = b.dueAt ?? new Date(now.getTime() + LOAN_DAYS * 86400000);
    const tx = await prisma.$transaction(async (db) => {
      // Same limit as borrow requests: books borrowed plus requests waiting.
      const [activeLoans, pending] = await Promise.all([
        db.borrowingTransaction.count({ where: { borrowerId: borrower.id, status: "ACTIVE" } }),
        db.borrowRequest.count({ where: { memberId: borrower.id, status: "PENDING" } }),
      ]);
      if (activeLoans + pending >= MAX_BOOKS_PER_MEMBER) throw Object.assign(new Error(`This member already has ${activeLoans} borrowed and ${pending} requested book(s); the limit is ${MAX_BOOKS_PER_MEMBER}.`), { status: 409 });
      // Only one desk (or one offline upload) can take this copy.
      const updated = await db.bookCopy.updateMany({ where: { id: copy.id, status: "AVAILABLE" }, data: { status: "BORROWED" } });
      if (updated.count === 0) throw Object.assign(new Error(`Copy ${copy.barcode} is not on the shelf (it is ${copy.status === "AVAILABLE" ? "being lent right now" : copy.status.toLowerCase()}).`), { status: 409 });
      const transaction = await db.borrowingTransaction.create({
        data: { bookCopyId: copy.id, borrowerId: borrower.id, dueAt, notes: b.notes ?? null, status: "ACTIVE", receiptNo: newReceiptNo(now) },
        include: { bookCopy: { include: { book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true } } } } },
      });
      await notifyTx(db, { userId: borrower.id, type: "BOOK_BORROWED", title: "Book borrowed", message: `You borrowed "${transaction.bookCopy.book.title}" at the library. Receipt ${transaction.receiptNo}. Please return it by ${phDay(dueAt)}.`, transactionId: transaction.id, createdById: req.user!.id });
      await writeAuditTx(db, { actorId: req.user?.id ?? null, action: "circulation.borrow", entityType: "BorrowingTransaction", entityId: transaction.id, metadata: { bookCopyId: copy.id, borrowerId: borrower.id, via: b.memberCode || b.copyCode ? "desk-scan" : "desk" } });
      return transaction;
    });
    void emailMember(borrower.id, (m) => borrowedAtDeskEmail(m.displayName, tx.bookCopy.book, tx.receiptNo!, dueAt));
    created(res, { ...tx, borrower: { id: borrower.id, displayName: borrower.displayName, maskedId: borrower.maskedId } });
  } catch (err) { next(err); }
});

circulationRouter.post("/return", authenticate, requirePermission("circulation:write"), validate({ body: returnSchema }), async (req, res, next) => {
  try {
    const { notes, copyCode } = req.body as { notes?: string; copyCode?: string; transactionId?: string };
    let transactionId = req.body.transactionId as string | undefined;
    if (copyCode) {
      const open = await prisma.borrowingTransaction.findFirst({ where: { status: "ACTIVE", bookCopy: { OR: [{ barcode: copyCode }, { barcode: copyCode.toUpperCase() }] } }, select: { id: true } });
      if (!open) return fail(res, 404, `Copy ${copyCode} is not borrowed right now.`);
      transactionId = open.id;
    }
    const tx = await prisma.borrowingTransaction.findUnique({ where: { id: transactionId! }, include: { bookCopy: { include: { book: { select: { title: true, authors: true, isbn: true, coverUrl: true } } } } } });
    if (!tx) return fail(res, 404, "Transaction not found");
    if (tx.status !== "ACTIVE") return fail(res, 409, "Transaction not active");

    const now = new Date();
    const outcome: "RETURNED_ON_TIME" | "RETURNED_LATE" | "DAMAGED" | "MISSING" =
      req.body.outcome ?? (tx.dueAt && now > tx.dueAt ? "RETURNED_LATE" : "RETURNED_ON_TIME");
    const copyStatus = outcome === "DAMAGED" ? "DAMAGED" : outcome === "MISSING" ? "LOST" : "AVAILABLE";
    const outcomeText = { RETURNED_ON_TIME: "returned on time", RETURNED_LATE: "returned late", DAMAGED: "returned damaged (torn)", MISSING: "recorded as missing" }[outcome];

    const updated = await prisma.$transaction(async (db) => {
      const upd = await db.borrowingTransaction.updateMany({ where: { id: tx.id, status: "ACTIVE" }, data: { status: outcome === "MISSING" ? "LOST" : "RETURNED", returnedAt: outcome === "MISSING" ? null : now, outcome, notes: notes ?? tx.notes } });
      if (upd.count === 0) throw Object.assign(new Error("Transaction not active"), { status: 409 });
      await db.bookCopy.update({ where: { id: tx.bookCopyId }, data: { status: copyStatus } });
      const result = await db.borrowingTransaction.findUnique({ where: { id: tx.id } });
      await notifyTx(db, { userId: tx.borrowerId, type: "RETURN_RECORDED", title: "Book return recorded", message: `"${tx.bookCopy?.book?.title ?? "Your book"}" was ${outcomeText}.`, transactionId: tx.id, createdById: req.user?.id ?? null });
      await writeAuditTx(db, { actorId: req.user?.id ?? null, action: "circulation.return", entityType: "BorrowingTransaction", entityId: tx.id, metadata: { bookCopyId: tx.bookCopyId, outcome } });
      return result;
    });
    void emailMember(tx.borrowerId, (m) => bookReturnedEmail(m.displayName, tx.bookCopy.book, outcome, tx.receiptNo));
    if (outcome !== "MISSING") void notifyWatchers(tx.bookCopy.bookId);
    ok(res, updated!, "Returned");
  } catch (err) { next(err); }
});

circulationRouter.get("/transactions", authenticate, async (req, res, next) => {
  try {
    const privileged = req.user?.permissions.includes("circulation:read") || req.user?.role === "ADMIN";
    const requestedBorrower = typeof req.query.borrowerId === "string" ? req.query.borrowerId : undefined;
    const borrowerId = privileged ? requestedBorrower : req.user?.id;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const bookCopyId = typeof req.query.bookCopyId === "string" ? req.query.bookCopyId : undefined;
    const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);

    const where: Record<string, unknown> = {};
    if (borrowerId) where.borrowerId = borrowerId;
    if (status) where.status = status;
    if (bookCopyId) where.bookCopyId = bookCopyId;
    if (bookId) where.bookCopy = { bookId };
    if (from || to) where.borrowedAt = { ...(from && !isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !isNaN(to.getTime()) ? { lte: to } : {}) };

    const [items, total] = await Promise.all([
      prisma.borrowingTransaction.findMany({ where, include: { bookCopy: { include: { book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true } } } }, borrower: { select: { id: true, username: true, displayName: true, maskedId: true } } }, orderBy: { borrowedAt: "desc" }, take, skip }),
      prisma.borrowingTransaction.count({ where }),
    ]);
    ok(res, { items, total, limit: take, offset: skip });
  } catch (err) { next(err); }
});

circulationRouter.get("/transactions/:id", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    // Includes everything a receipt shows (book, copy barcode, borrower, approving librarian).
    const tx = await prisma.borrowingTransaction.findUnique({ where: { id }, include: { bookCopy: { include: { book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true, serialNumber: true, publisher: true, publishedYear: true } } } }, borrower: { select: { id: true, username: true, displayName: true, memberType: true } }, request: { select: { id: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { username: true, displayName: true } } } } } });
    if (!tx) return fail(res, 404, "Transaction not found");
    const privileged = req.user?.permissions.includes("circulation:read") || req.user?.role === "ADMIN";
    if (!privileged && tx.borrowerId !== req.user?.id) return fail(res, 403, "Forbidden");
    ok(res, tx);
  } catch (err) { next(err); }
});