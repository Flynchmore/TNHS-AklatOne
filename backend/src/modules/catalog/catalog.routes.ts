import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { bookCreateSchema, bookUpdateSchema, ratingSchema, reviewStatusSchema } from "./book.schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { editConflict } from "../../common/conflict.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { verifyToken } from "../auth/auth.service.js";
import type { Prisma } from "@prisma/client";
import { schoolWeek } from "../reports/reports.routes.js";
import { applyPlan, exportWorkbook, parseWorkbook, planImport, savePreview, takePreview, templateWorkbook } from "./catalog.import.js";

/** Drops undefined fields (the schema allows "not sent"; Prisma, with exactOptionalPropertyTypes, wants them absent). */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };

export const catalogRouter = Router();

const SORTABLE = new Set(["title", "authors", "publishedYear", "serialNumber", "createdAt", "updatedAt"]);

/** The signed-in user if a valid token was sent; the catalog itself stays public. */
function optionalUserId(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  try { return verifyToken(h.slice(7)).id; } catch { return null; }
}

/** Staff (catalog editors) also see hidden books; members and visitors never do. */
function viewerIsStaff(req: Request): boolean {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return false;
  try { const u = verifyToken(h.slice(7)); return u.role === "ADMIN" || u.permissions.includes("catalog:write"); } catch { return false; }
}

type BookWithCopies = { id: string; copies?: { status: string }[] } & Record<string, unknown>;

/** Loans that count as "borrowed" (a cancelled loan never left the shelf). */
const COUNTED_LOAN = { status: { not: "CANCELLED" as const } };

/** True when the member has ever borrowed a copy of this book (required before rating it). */
const hasBorrowed = async (memberId: string, bookId: string) =>
  !!(await prisma.borrowingTransaction.findFirst({ where: { borrowerId: memberId, ...COUNTED_LOAN, bookCopy: { bookId } }, select: { id: true } }));

/** Adds availability, times borrowed, average rating and (when signed in) the member's own rating / right to rate. */
/** All ids must exist and at most one category of each kind (Subject, Wattpad, Genre) per book. Returns an error message or null. */
async function checkCategories(ids: string[] | undefined): Promise<string | null> {
  if (!ids?.length) return null;
  const cats = await prisma.category.findMany({ where: { id: { in: ids } }, select: { kind: true } });
  if (cats.length !== new Set(ids).size) return "Unknown category";
  return new Set(cats.map(c => c.kind)).size === cats.length ? null : "A book can have only one Subject, one Wattpad and one Genre category";
}

async function present(books: BookWithCopies[], userId: string | null) {
  const ids = books.map(b => b.id);
  const [agg, mine, copyLoans, borrowedByMe, favs, watches] = await Promise.all([
    prisma.bookRating.groupBy({ by: ["bookId"], where: { bookId: { in: ids } }, _avg: { stars: true }, _count: { _all: true } }),
    userId ? prisma.bookRating.findMany({ where: { bookId: { in: ids }, memberId: userId }, select: { bookId: true, stars: true, review: true, reviewStatus: true } }) : Promise.resolve([]),
    prisma.bookCopy.findMany({ where: { bookId: { in: ids } }, select: { bookId: true, _count: { select: { transactions: { where: COUNTED_LOAN } } } } }),
    userId ? prisma.borrowingTransaction.findMany({ where: { borrowerId: userId, ...COUNTED_LOAN, bookCopy: { bookId: { in: ids } } }, select: { bookCopy: { select: { bookId: true } } } }) : Promise.resolve([]),
    userId ? prisma.favourite.findMany({ where: { memberId: userId, bookId: { in: ids } }, select: { bookId: true } }) : Promise.resolve([]),
    userId ? prisma.bookWatch.findMany({ where: { userId, bookId: { in: ids } }, select: { bookId: true } }) : Promise.resolve([]),
  ]);
  const watchSet = new Set(watches.map(w => w.bookId));
  const favSet = new Set(favs.map(f => f.bookId));
  const byBook = new Map(agg.map(a => [a.bookId, { average: Math.round((a._avg.stars ?? 0) * 10) / 10, count: a._count._all }]));
  const myByBook = new Map(mine.map(m => [m.bookId, m.stars]));
  const myReview = new Map(mine.map(m => [m.bookId, m.review ? { text: m.review, status: m.reviewStatus } : null]));
  const borrowCount = new Map<string, number>();
  for (const c of copyLoans) borrowCount.set(c.bookId, (borrowCount.get(c.bookId) ?? 0) + c._count.transactions);
  const iBorrowed = new Set(borrowedByMe.map(t => t.bookCopy.bookId));
  return books.map(({ copies = [], ...rest }) => ({
    ...rest,
    availability: { total: copies.length, available: copies.filter(c => c.status === "AVAILABLE").length },
    borrowCount: borrowCount.get(rest.id) ?? 0,
    rating: byBook.get(rest.id) ?? { average: 0, count: 0 },
    myRating: myByBook.get(rest.id) ?? null,
    myReview: myReview.get(rest.id) ?? null,
    canRate: iBorrowed.has(rest.id),
    favourite: favSet.has(rest.id),
    watching: watchSet.has(rest.id),
  }));
}

catalogRouter.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    if (categoryId && !z.string().cuid().safeParse(categoryId).success) return fail(res, 400, "Invalid category id");
    const sortBy = typeof req.query.sortBy === "string" && SORTABLE.has(req.query.sortBy) ? req.query.sortBy : "title";
    const sortOrder = req.query.sortOrder === "desc" ? "desc" : "asc";
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);

    const where: Record<string, unknown> = {};
    if (q) where.OR = [{ title: { contains: q } }, { authors: { contains: q } }, { isbn: { contains: q } }, { serialNumber: { contains: q } }];
    if (categoryId) where.categories = { some: { id: categoryId } };
    // "Available now": at least one copy on the shelf.
    if (req.query.available === "1") where.copies = { some: { status: "AVAILABLE" } };
    if (!viewerIsStaff(req)) where.isHidden = false;
    else if (req.query.hidden === "1") where.isHidden = true;

    const [books, total] = await Promise.all([
      prisma.book.findMany({ where, include: { categories: true, copies: { select: { status: true } } }, orderBy: { [sortBy]: sortOrder }, take, skip }),
      prisma.book.count({ where }),
    ]);
    ok(res, { items: await present(books, optionalUserId(req)), total, limit: take, offset: skip });
  } catch (err) { next(err); }
});

// --- Excel import / export (staff) ---
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sendXlsx = (res: Response, name: string, body: Buffer) => {
  res.setHeader("Content-Type", XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
};
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());

catalogRouter.get("/export.xlsx", authenticate, requirePermission("catalog:write"), async (_req, res, next) => {
  try { sendXlsx(res, `aklatone-books-${today()}.xlsx`, await exportWorkbook(prisma)); } catch (err) { next(err); }
});

catalogRouter.get("/import-template.xlsx", authenticate, requirePermission("catalog:write"), async (_req, res, next) => {
  try { sendXlsx(res, "aklatone-books-template.xlsx", await templateWorkbook()); } catch (err) { next(err); }
});

/** Upload an .xlsx (raw body) and see what would change. Nothing is saved yet. */
catalogRouter.post("/import/preview", authenticate, requirePermission("catalog:write"), express.raw({ type: () => true, limit: "10mb" }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 400, "Choose an Excel (.xlsx) file.");
    const { rows, ignoredColumns } = await parseWorkbook(req.body);
    if (!rows.length) return fail(res, 400, "The file has no book rows under the header.");
    const plan = await planImport(prisma, rows);
    ok(res, {
      token: savePreview(req.user!.id, rows),
      rows: rows.length, ignoredColumns, unchanged: plan.unchanged, errors: plan.errors, hide: plan.hide,
      create: plan.create.map((c) => ({ row: c.row, title: c.data.title, authors: c.data.authors, isbn: c.data.isbn, serialNumber: c.data.serialNumber, copies: c.copies })),
      update: plan.update.map((u) => ({ row: u.row, id: u.id, title: u.title, changes: u.changes })),
    });
  } catch (err) { next(err); }
});

const applySchema = z.object({ token: z.string().min(10).max(64), hideMissing: z.boolean().default(false) });
/** Applies a preview in one transaction (all or nothing), re-checked against the catalog as it is now. */
catalogRouter.post("/import/apply", authenticate, requirePermission("catalog:write"), validate({ body: applySchema }), async (req, res, next) => {
  try {
    const { token, hideMissing } = req.body as z.infer<typeof applySchema>;
    const rows = takePreview(token, req.user!.id);
    if (!rows) return fail(res, 410, "This preview expired (15 minutes) or was already used. Upload the file again.");
    const result = await prisma.$transaction(async (tx) => {
      const r = await applyPlan(tx, await planImport(tx, rows), hideMissing);
      await writeAuditTx(tx, { actorId: req.user!.id, action: "book.import", entityType: "Book", metadata: { ...r, rows: rows.length, hideMissing } });
      return r;
    }, { timeout: 120_000 });
    ok(res, result, "Import applied");
  } catch (err) { next(err); }
});

/**
 * Books borrowed this school week (Monday-Friday, PH time; on weekends the week just ended), most borrowed first.
 * For the member app: titles and how many times only, never who borrowed them. Hidden books are left out.
 */
catalogRouter.get("/this-week", authenticate, async (_req, res, next) => {
  try {
    const days = schoolWeek(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" }));
    const lent = await prisma.borrowingTransaction.findMany({
      where: { borrowedAt: { gte: new Date(`${days[0]}T00:00:00+08:00`), lte: new Date(`${days[4]}T23:59:59.999+08:00`) }, status: { not: "CANCELLED" }, bookCopy: { book: { isHidden: false } } },
      select: { bookCopy: { select: { book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true } } } } },
    });
    const titles = new Map<string, { id: string; title: string; authors: string | null; isbn: string | null; coverUrl: string | null; times: number }>();
    for (const l of lent) { const b = l.bookCopy.book; const t = titles.get(b.id) ?? { ...b, times: 0 }; t.times++; titles.set(b.id, t); }
    ok(res, { from: days[0], to: days[4], total: lent.length, items: [...titles.values()].sort((a, b) => b.times - a.times || a.title.localeCompare(b.title)).slice(0, 10) });
  } catch (err) { next(err); }
});

/** Staff: written reviews waiting for approval (or all of one status). */
catalogRouter.get("/reviews", authenticate, requirePermission("catalog:write"), async (req, res, next) => {
  try {
    const status = ["PENDING", "APPROVED", "HIDDEN"].includes(String(req.query.status)) ? String(req.query.status) : "PENDING";
    const [items, pending] = await Promise.all([
      prisma.bookRating.findMany({
        where: { reviewStatus: status }, orderBy: { updatedAt: "desc" }, take: 100,
        select: { id: true, stars: true, review: true, reviewStatus: true, updatedAt: true, book: { select: { id: true, title: true } }, member: { select: { displayName: true, maskedId: true } } },
      }),
      prisma.bookRating.count({ where: { reviewStatus: "PENDING" } }),
    ]);
    ok(res, { items, pending });
  } catch (err) { next(err); }
});

catalogRouter.patch("/reviews/:id", authenticate, requirePermission("catalog:write"), validate({ params: idParamSchema, body: reviewStatusSchema }), async (req, res, next) => {
  try {
    const found = await prisma.bookRating.findUnique({ where: { id: req.params.id as string }, select: { id: true, review: true } });
    if (!found?.review) return fail(res, 404, "Review not found");
    const status = (req.body as { status: string }).status;
    await prisma.$transaction(async (db) => {
      await db.bookRating.update({ where: { id: found.id }, data: { reviewStatus: status, reviewedAt: new Date() } });
      await writeAuditTx(db, { actorId: req.user?.id ?? null, action: "review.moderate", entityType: "BookRating", entityId: found.id, metadata: { status } });
    });
    ok(res, { id: found.id, reviewStatus: status }, status === "APPROVED" ? "Review shown" : "Review hidden");
  } catch (err) { next(err); }
});

/** A copy's QR label holds only its copy code: find the book so a member can scan a book on the shelf. */
catalogRouter.get("/by-copy/:code", authenticate, async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().slice(0, 64);
    const copy = await prisma.bookCopy.findFirst({ where: { OR: [{ barcode: code }, { barcode: code.toUpperCase() }] }, select: { bookId: true, book: { select: { isHidden: true } } } });
    if (!copy || (copy.book.isHidden && !viewerIsStaff(req))) return fail(res, 404, "No book has this QR code");
    ok(res, { bookId: copy.bookId });
  } catch (err) { next(err); }
});

/** Approved written reviews of a book (first name only, never the Member ID). */
catalogRouter.get("/:id/reviews", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const rows = await prisma.bookRating.findMany({
      where: { bookId: req.params.id as string, reviewStatus: "APPROVED", book: { isHidden: false } }, orderBy: { updatedAt: "desc" }, take: 50,
      select: { id: true, stars: true, review: true, updatedAt: true, member: { select: { displayName: true } } },
    });
    ok(res, rows.map(r => ({ id: r.id, stars: r.stars, review: r.review, updatedAt: r.updatedAt, name: (r.member.displayName ?? "Member").split(/\s+/)[0] })));
  } catch (err) { next(err); }
});

/** "Notify me when available": only members, only while no copy is on the shelf. */
catalogRouter.put("/:id/watch", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    if (req.user?.role !== "MEMBER") return fail(res, 403, "Only members can be notified");
    const bookId = req.params.id as string;
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { isHidden: true, copies: { where: { status: "AVAILABLE" }, select: { id: true }, take: 1 } } });
    if (!book || book.isHidden) return fail(res, 404, "Book not found");
    if (book.copies.length) return fail(res, 409, "A copy is on the shelf now. You can request it.");
    await prisma.bookWatch.upsert({ where: { userId_bookId: { userId: req.user.id, bookId } }, create: { userId: req.user.id, bookId }, update: {} });
    ok(res, { watching: true }, "We will notify you");
  } catch (err) { next(err); }
});

catalogRouter.delete("/:id/watch", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    await prisma.bookWatch.deleteMany({ where: { userId: req.user!.id, bookId: req.params.id as string } });
    ok(res, { watching: false }, "Notification cancelled");
  } catch (err) { next(err); }
});

catalogRouter.get("/:id", validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const book = await prisma.book.findUnique({ where: { id: req.params.id as string }, include: { categories: true, copies: { select: { status: true } } } });
    if (!book || (book.isHidden && !viewerIsStaff(req))) return fail(res, 404, "Book not found");
    ok(res, (await present([book], optionalUserId(req)))[0]);
  } catch (err) { next(err); }
});

/** Friendly 409 for duplicate serial number / ISBN (instead of a generic unique-constraint error). */
async function duplicateMessage(data: { serialNumber?: string | null | undefined; isbn?: string | null | undefined }, exceptId?: string) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  if (data.serialNumber && await prisma.book.findFirst({ where: { serialNumber: data.serialNumber, ...not } })) return `Serial number ${data.serialNumber} is already used by another book.`;
  if (data.isbn && await prisma.book.findFirst({ where: { isbn: data.isbn, ...not } })) return `ISBN ${data.isbn} is already used by another book.`;
  return null;
}

catalogRouter.post("/", authenticate, requirePermission("catalog:write"), validate({ body: bookCreateSchema }), async (req, res, next) => {
  try {
    const { categoryIds, copies = 0, ...data } = req.body as z.infer<typeof bookCreateSchema>;
    const catError = await checkCategories(categoryIds);
    if (catError) return fail(res, 400, catError);
    const dup = await duplicateMessage(data);
    if (dup) return fail(res, 409, dup);
    const prefix = data.serialNumber ?? `BK-${randomBytes(3).toString("hex").toUpperCase()}`;
    const book = await prisma.$transaction(async (tx) => {
      const createdBook = await tx.book.create({
        data: defined({
          ...data,
          categories: categoryIds?.length ? { connect: categoryIds.map((id: string) => ({ id })) } : undefined,
          copies: copies > 0 ? { create: Array.from({ length: copies }, (_, i) => ({ barcode: `${prefix}-${String(i + 1).padStart(2, "0")}` })) } : undefined,
        }) as Prisma.BookCreateInput,
        include: { categories: true },
      });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "book.create", entityType: "Book", entityId: createdBook.id, metadata: { title: createdBook.title, copies } });
      return createdBook;
    });
    created(res, book);
  } catch (err) { next(err); }
});

catalogRouter.patch("/:id", authenticate, requirePermission("catalog:write"), validate({ params: idParamSchema, body: bookUpdateSchema }), async (req, res, next) => {
  try {
    const { categoryIds, ...data } = req.body as z.infer<typeof bookUpdateSchema>;
    const current = await prisma.book.findUnique({ where: { id: req.params.id as string }, select: { updatedAt: true } });
    if (!current) return fail(res, 404, "Book not found");
    const conflict = editConflict(req, current.updatedAt);
    if (conflict) return fail(res, 409, conflict);
    const catError = await checkCategories(categoryIds);
    if (catError) return fail(res, 400, catError);
    const dup = await duplicateMessage(data, req.params.id as string);
    if (dup) return fail(res, 409, dup);
    const book = await prisma.$transaction(async (tx) => {
      const updated = await tx.book.update({ where: { id: req.params.id as string }, data: defined({ ...data, categories: categoryIds ? { set: categoryIds.map((id: string) => ({ id })) } : undefined }) as Prisma.BookUpdateInput, include: { categories: true } });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "book.update", entityType: "Book", entityId: updated.id, metadata: { title: updated.title } });
      return updated;
    });
    ok(res, book);
  } catch (err) { next(err); }
});

/** A member rates a book 1-5 stars (one rating per member per book; rating again updates it). */
catalogRouter.put("/:id/rating", authenticate, validate({ params: idParamSchema, body: ratingSchema }), async (req, res, next) => {
  try {
    if (req.user?.role !== "MEMBER") return fail(res, 403, "Only members can rate books");
    const bookId = req.params.id as string;
    const { stars, review } = req.body as { stars: number; review?: string };
    if (!(await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } }))) return fail(res, 404, "Book not found");
    if (!(await hasBorrowed(req.user.id, bookId))) return fail(res, 403, "You can rate a book after you have borrowed it.");
    await prisma.bookRating.upsert({ where: { bookId_memberId: { bookId, memberId: req.user.id } }, create: { bookId, memberId: req.user.id, stars, ...reviewData(review) }, update: { stars, ...reviewData(review) } });
    const agg = await prisma.bookRating.aggregate({ where: { bookId }, _avg: { stars: true }, _count: { _all: true } });
    ok(res, { myRating: stars, rating: { average: Math.round((agg._avg.stars ?? 0) * 10) / 10, count: agg._count._all } }, "Rated");
  } catch (err) { next(err); }
});

/** A new or changed review waits for the librarian again; an empty one is removed; undefined leaves it as it is. */
function reviewData(review: string | undefined) {
  if (review === undefined) return {};
  return review ? { review, reviewStatus: "PENDING", reviewedAt: null } : { review: null, reviewStatus: null, reviewedAt: null };
}

const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Counts a member's view of a book (the app calls this after ~12 s on the book). At most once per member per book per day. */
catalogRouter.post("/:id/view", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    if (req.user?.role !== "MEMBER") return fail(res, 403, "Only member views are counted");
    const bookId = req.params.id as string;
    const memberId = req.user.id;
    const result = await prisma.$transaction(async (tx) => {
      const book = await tx.book.findUnique({ where: { id: bookId }, select: { viewCount: true } });
      if (!book) throw Object.assign(new Error("Book not found"), { status: 404 });
      const now = new Date();
      const prev = await tx.bookView.findUnique({ where: { bookId_memberId: { bookId, memberId } } });
      if (prev && now.getTime() - prev.lastViewedAt.getTime() < VIEW_WINDOW_MS) return { counted: false, viewCount: book.viewCount };
      await tx.bookView.upsert({ where: { bookId_memberId: { bookId, memberId } }, create: { bookId, memberId, lastViewedAt: now }, update: { lastViewedAt: now } });
      const updated = await tx.book.update({ where: { id: bookId }, data: { viewCount: { increment: 1 } }, select: { viewCount: true } });
      return { counted: true, viewCount: updated.viewCount };
    });
    ok(res, result);
  } catch (err) { next(err); }
});

catalogRouter.delete("/:id", authenticate, requirePermission("catalog:write"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.book.delete({ where: { id: req.params.id as string } });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "book.delete", entityType: "Book", entityId: req.params.id as string });
    });
    ok(res, null, "Deleted");
  } catch (err) { next(err); }
});
