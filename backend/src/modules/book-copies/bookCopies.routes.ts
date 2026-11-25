import { Router } from "express";

import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { bookCopyCreateSchema, bookCopyDetailsSchema, bookCopyStatusSchema } from "./bookCopy.schemas.js";
import { phDate } from "../catalog/book.schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { notifyWatchers } from "../catalog/watchers.js";

export const bookCopiesRouter = Router();

bookCopiesRouter.get("/", authenticate, requirePermission("copies:read"), async (req, res, next) => {
  try {
    const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where: Record<string, unknown> = {};
    if (bookId) where.bookId = bookId;
    if (status) where.status = status;
    const [copies, total] = await Promise.all([
      prisma.bookCopy.findMany({ where, include: { book: true }, orderBy: { createdAt: "desc" }, take, skip }),
      prisma.bookCopy.count({ where }),
    ]);
    ok(res, { items: copies, total, limit: take, offset: skip });
  } catch (err) { next(err); }
});

bookCopiesRouter.get("/summary", authenticate, requirePermission("copies:read"), async (_req, res, next) => {
  try {
    const groups = await prisma.bookCopy.groupBy({ by: ["status"], _count: { _all: true } });
    const total = groups.reduce((acc, g) => acc + g._count._all, 0);
    ok(res, { total, byStatus: groups.map((g) => ({ status: g.status, count: g._count._all })) });
  } catch (err) { next(err); }
});

bookCopiesRouter.get("/:id", authenticate, requirePermission("copies:read"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const copy = await prisma.bookCopy.findUnique({ where: { id: req.params.id as string }, include: { book: true } });
    if (!copy) return fail(res, 404, "Copy not found");
    ok(res, copy);
  } catch (err) { next(err); }
});

bookCopiesRouter.post("/", authenticate, requirePermission("copies:write"), validate({ body: bookCopyCreateSchema }), async (req, res, next) => {
  try {
    const copy = await prisma.$transaction(async (tx) => {
      const book = await tx.book.findUnique({ where: { id: req.body.bookId } });
      if (!book) throw Object.assign(new Error("Book not found"), { status: 404 });
      let barcode: string | undefined = req.body.barcode;
      if (!barcode) {
        // Next free "<serial or ISBN>-NN" code, same pattern as copies made with a new book.
        const prefix = book.serialNumber ?? book.isbn ?? `BK-${book.id.slice(-6).toUpperCase()}`;
        for (let n = (await tx.bookCopy.count({ where: { bookId: book.id } })) + 1; !barcode; n++) {
          const code = `${prefix}-${String(n).padStart(2, "0")}`;
          if (!(await tx.bookCopy.findUnique({ where: { barcode: code } }))) barcode = code;
        }
      }
      const { dateReceived, ...rest } = req.body as { dateReceived?: string | null };
      const createdCopy = await tx.bookCopy.create({ data: { ...rest, barcode, ...(dateReceived ? { acquiredAt: phDate(dateReceived) } : {}) } as never });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "bookCopy.create", entityType: "BookCopy", entityId: createdCopy.id, metadata: { barcode: createdCopy.barcode, status: createdCopy.status } });
      return createdCopy;
    });
    if (copy.status === "AVAILABLE") void notifyWatchers(copy.bookId);
    created(res, copy);
  } catch (err) { next(err); }
});

bookCopiesRouter.patch("/:id/status", authenticate, requirePermission("copies:write"), validate({ params: idParamSchema, body: bookCopyStatusSchema }), async (req, res, next) => {
  try {
    const copy = await prisma.$transaction(async (tx) => {
      const existing = await tx.bookCopy.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw Object.assign(new Error("Copy not found"), { status: 404 });
      if (existing.status === "BORROWED" && req.body.status === "AVAILABLE") throw Object.assign(new Error("Borrowed copy cannot be marked available directly"), { status: 409 });
      if (existing.status === "RETIRED") throw Object.assign(new Error("Retired copy status cannot change"), { status: 409 });
      const updated = await tx.bookCopy.update({ where: { id: req.params.id as string }, data: { status: req.body.status } });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "bookCopy.statusChange", entityType: "BookCopy", entityId: updated.id, metadata: { status: updated.status } });
      return updated;
    });
    if (copy.status === "AVAILABLE") void notifyWatchers(copy.bookId);
    ok(res, copy);
  } catch (err) { next(err); }
});

/** Shelf location, date received and notes of one copy. */
bookCopiesRouter.patch("/:id", authenticate, requirePermission("copies:write"), validate({ params: idParamSchema, body: bookCopyDetailsSchema }), async (req, res, next) => {
  try {
    const { dateReceived, ...rest } = req.body as { location?: string | null; notes?: string | null; dateReceived?: string | null };
    if (!(await prisma.bookCopy.findUnique({ where: { id: req.params.id as string }, select: { id: true } }))) return fail(res, 404, "Copy not found");
    const copy = await prisma.$transaction(async (tx) => {
      const updated = await tx.bookCopy.update({
        where: { id: req.params.id as string },
        data: { ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), ...(dateReceived !== undefined ? { acquiredAt: dateReceived ? phDate(dateReceived) : null } : {}) },
      });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "bookCopy.update", entityType: "BookCopy", entityId: updated.id, metadata: { fields: Object.keys(req.body) } });
      return updated;
    });
    ok(res, copy, "Copy updated");
  } catch (err) { next(err); }
});

bookCopiesRouter.delete("/:id", authenticate, requirePermission("copies:write"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.bookCopy.delete({ where: { id: req.params.id as string } });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "bookCopy.delete", entityType: "BookCopy", entityId: req.params.id as string });
    });
    ok(res, null, "Deleted");
  } catch (err) { next(err); }
});