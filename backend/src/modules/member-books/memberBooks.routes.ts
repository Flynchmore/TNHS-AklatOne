import express, { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { ok, created, fail } from "../../common/response.js";
import { notifyTx } from "../../common/notify.js";
import { writeAudit, writeAuditTx } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";

const isMember = (role?: string) => role === "MEMBER";
const memberSelect = { maskedId: true, memberType: true, gradeSection: true, department: true } as const;
const group = (m: { memberType: string | null; gradeSection: string | null; department: string | null }) => (m.memberType === "Teacher" ? m.department : m.gradeSection) ?? null;

/** Philippine school year (June to May): "SY 2026-2027". */
export function schoolYear(now = new Date()): string {
  const [y, m] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(now).split("-").map(Number) as [number, number];
  return m >= 6 ? `SY ${y}-${y + 1}` : `SY ${y - 1}-${y}`;
}

// ---------------------------------------------------------------- school-issued books

export const issuedBooksRouter = Router();

const issuedSchema = z.object({
  title: z.string().trim().min(1, "Type the title of the book").max(255),
  subject: z.string().trim().max(100).optional(),
  code: z.string().trim().max(60).optional(),
  condition: z.string().trim().max(100).optional(),
});
const blank = (v?: string) => (v?.trim() ? v.trim() : null);

/** Member: the school's books I keep this school year (typed in one by one; no limit). */
issuedBooksRouter.get("/mine", authenticate, async (req, res, next) => {
  try {
    const items = await prisma.issuedBook.findMany({ where: { memberId: req.user!.id }, orderBy: [{ schoolYear: "desc" }, { createdAt: "desc" }] });
    ok(res, { schoolYear: schoolYear(), items });
  } catch (err) { next(err); }
});

issuedBooksRouter.post("/", authenticate, validate({ body: issuedSchema }), async (req, res, next) => {
  try {
    if (!isMember(req.user?.role)) return fail(res, 403, "Only members add the school's books they received.");
    const b = req.body as z.infer<typeof issuedSchema>;
    const item = await prisma.issuedBook.create({ data: { memberId: req.user!.id, title: b.title, subject: blank(b.subject), code: blank(b.code), condition: blank(b.condition), schoolYear: schoolYear() } });
    created(res, item);
  } catch (err) { next(err); }
});

/** Member: remove a book typed by mistake (only before the librarian checked it). */
issuedBooksRouter.delete("/:id", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const gone = await prisma.issuedBook.deleteMany({ where: { id: req.params.id as string, memberId: req.user!.id, checkedAt: null, status: "ISSUED" } });
    if (!gone.count) return fail(res, 409, "This book was already checked by the librarian. Ask the librarian to change it.");
    ok(res, { deleted: true });
  } catch (err) { next(err); }
});

/** Librarian: every member's school-issued books (search by title, code or Member ID; filter by school year / status). */
issuedBooksRouter.get("/", authenticate, requirePermission("circulation:read"), async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const status = req.query.status === "ISSUED" || req.query.status === "RETURNED" ? req.query.status : undefined;
    const sy = typeof req.query.schoolYear === "string" && req.query.schoolYear ? req.query.schoolYear : schoolYear();
    const rows = await prisma.issuedBook.findMany({
      where: { schoolYear: sy, ...(status ? { status } : {}), ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }, { subject: { contains: q } }, { member: { maskedId: { contains: q } } }] } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 1000,
      include: { member: { select: memberSelect } },
    });
    const years = await prisma.issuedBook.findMany({ distinct: ["schoolYear"], select: { schoolYear: true }, orderBy: { schoolYear: "desc" } });
    ok(res, {
      schoolYear: sy, years: [...new Set([schoolYear(), ...years.map((y) => y.schoolYear)])],
      items: rows.map(({ member, ...r }) => ({ ...r, memberId: member.maskedId, group: group(member) })),
    });
  } catch (err) { next(err); }
});

const checkSchema = z.object({ checked: z.boolean().optional(), status: z.enum(["ISSUED", "RETURNED"]).optional() });

/** Librarian: mark a book as checked (seen), or as returned at the end of the school year. */
issuedBooksRouter.patch("/:id", authenticate, requirePermission("circulation:write"), validate({ params: idParamSchema, body: checkSchema }), async (req, res, next) => {
  try {
    const { checked, status } = req.body as z.infer<typeof checkSchema>;
    const now = new Date();
    const item = await prisma.issuedBook.update({
      where: { id: req.params.id as string },
      data: {
        ...(checked !== undefined ? { checkedAt: checked ? now : null, checkedById: checked ? req.user!.id : null } : {}),
        ...(status ? { status, returnedAt: status === "RETURNED" ? now : null } : {}),
      },
    });
    await writeAudit({ actorId: req.user!.id, action: "issuedBook.update", entityType: "IssuedBook", entityId: item.id, metadata: { checked, status } });
    ok(res, item);
  } catch (err) { next(err); }
});

/** Librarian, end of the school year: every book still with members in that year becomes Returned. */
issuedBooksRouter.post("/return-all", authenticate, requirePermission("circulation:write"), validate({ body: z.object({ schoolYear: z.string().min(4).max(20) }) }), async (req, res, next) => {
  try {
    const sy = (req.body as { schoolYear: string }).schoolYear;
    const r = await prisma.issuedBook.updateMany({ where: { schoolYear: sy, status: "ISSUED" }, data: { status: "RETURNED", returnedAt: new Date() } });
    await writeAudit({ actorId: req.user!.id, action: "issuedBook.returnAll", entityType: "IssuedBook", metadata: { schoolYear: sy, count: r.count } });
    ok(res, { returned: r.count });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- lost-book apology / report documents

export const lostReportsRouter = Router();

const MAX_FILE = 10 * 1024 * 1024;
// The file's first bytes decide its type (the name or the browser's claim are not trusted).
const KINDS: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  { mime: "application/msword", ext: "doc", test: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
];
export const fileKind = (b: Buffer) => KINDS.find((k) => b.length > 8 && k.test(b)) ?? null;
const dir = () => resolve(env.UPLOAD_DIR, "lost-reports");
const cleanName = (n: string) => n.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 150) || "document";

/**
 * Member: send an apology letter or a report about a lost book (raw file body; ?kind=APOLOGY|REPORT&transactionId=&message=&name=).
 * PDF, Word (.docx / .doc), JPG or PNG up to 10 MB; checked by content, stored outside the web folder with a random name.
 */
lostReportsRouter.post("/", authenticate, express.raw({ type: () => true, limit: MAX_FILE }), async (req, res, next) => {
  try {
    if (!isMember(req.user?.role)) return fail(res, 403, "Only members send lost-book documents.");
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) return fail(res, 400, "Choose the file to send (PDF, Word or a photo).");
    const kind = fileKind(body);
    if (!kind) return fail(res, 400, "This file type is not accepted. Send a PDF, a Word file (.docx or .doc) or a JPG / PNG photo.");
    const type = req.query.kind === "REPORT" ? "REPORT" : "APOLOGY";
    const message = typeof req.query.message === "string" ? req.query.message.slice(0, 1000) : null;
    const transactionId = typeof req.query.transactionId === "string" && req.query.transactionId ? req.query.transactionId : null;
    if (transactionId && !(await prisma.borrowingTransaction.findFirst({ where: { id: transactionId, borrowerId: req.user!.id }, select: { id: true } }))) return fail(res, 404, "That borrowed book was not found in your account.");
    const name = cleanName(typeof req.query.name === "string" ? req.query.name : `document.${kind.ext}`);
    const storedAs = `${randomUUID()}.${kind.ext}`;
    await mkdir(dir(), { recursive: true });
    await writeFile(join(dir(), storedAs), body, { flag: "wx" });
    const report = await prisma.lostReport.create({ data: { memberId: req.user!.id, transactionId, kind: type, message, fileName: name, mimeType: kind.mime, size: body.length, storedAs } });
    await writeAudit({ actorId: req.user!.id, action: "lostReport.create", entityType: "LostReport", entityId: report.id, metadata: { kind: type, transactionId } });
    created(res, { ...report, storedAs: undefined });
  } catch (err) { next(err); }
});

const publicFields = { id: true, transactionId: true, kind: true, message: true, fileName: true, mimeType: true, size: true, status: true, note: true, reviewedAt: true, createdAt: true } as const;

lostReportsRouter.get("/mine", authenticate, async (req, res, next) => {
  try {
    ok(res, { items: await prisma.lostReport.findMany({ where: { memberId: req.user!.id }, orderBy: { createdAt: "desc" }, select: publicFields }) });
  } catch (err) { next(err); }
});

/** Librarian: the documents members sent (newest first), with the borrowed book they are about. */
lostReportsRouter.get("/", authenticate, requirePermission("circulation:read"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" && ["SUBMITTED", "ACCEPTED", "NEEDS_MORE"].includes(req.query.status) ? req.query.status : undefined;
    const rows = await prisma.lostReport.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" }, take: 300, select: { ...publicFields, member: { select: memberSelect } } });
    const txs = await prisma.borrowingTransaction.findMany({ where: { id: { in: rows.map((r) => r.transactionId).filter((x): x is string => !!x) } }, select: { id: true, receiptNo: true, status: true, outcome: true, bookCopy: { select: { barcode: true, book: { select: { title: true } } } } } });
    const byTx = new Map(txs.map((t) => [t.id, t]));
    ok(res, {
      waiting: await prisma.lostReport.count({ where: { status: "SUBMITTED" } }),
      items: rows.map(({ member, ...r }) => {
        const t = r.transactionId ? byTx.get(r.transactionId) : undefined;
        return { ...r, memberId: member.maskedId, group: group(member), book: t ? { title: t.bookCopy.book.title, copy: t.bookCopy.barcode, receiptNo: t.receiptNo, status: t.status, outcome: t.outcome } : null };
      }),
    });
  } catch (err) { next(err); }
});

/** The file itself: for the member who sent it and for the librarian. Always a download, never shown inline. */
lostReportsRouter.get("/:id/file", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const r = await prisma.lostReport.findUnique({ where: { id: req.params.id as string } });
    const staff = req.user!.role === "ADMIN" || req.user!.permissions.includes("circulation:read");
    if (!r || (r.memberId !== req.user!.id && !staff)) return fail(res, 404, "Document not found.");
    const file = await readFile(join(dir(), r.storedAs)).catch(() => null);
    if (!file) return fail(res, 404, "The file is missing on the server.");
    res.set({ "Content-Type": r.mimeType, "Content-Disposition": `attachment; filename="${encodeURIComponent(r.fileName)}"`, "X-Content-Type-Options": "nosniff" }).send(file);
  } catch (err) { next(err); }
});

const reviewSchema = z.object({ status: z.enum(["ACCEPTED", "NEEDS_MORE"]), note: z.string().trim().max(300).optional() });

/** Librarian: accept the document, or ask for more; the member gets an alert. */
lostReportsRouter.patch("/:id", authenticate, requirePermission("circulation:write"), validate({ params: idParamSchema, body: reviewSchema }), async (req, res, next) => {
  try {
    const { status, note } = req.body as z.infer<typeof reviewSchema>;
    const r = await prisma.$transaction(async (db) => {
      const u = await db.lostReport.update({ where: { id: req.params.id as string }, data: { status, note: note || null, reviewedById: req.user!.id, reviewedAt: new Date() }, select: { ...publicFields, memberId: true } });
      await notifyTx(db, { userId: u.memberId, type: "SUGGESTION_UPDATE", title: status === "ACCEPTED" ? "Lost-book document accepted" : "The librarian needs more about the lost book", message: `${u.fileName}: ${status === "ACCEPTED" ? "accepted" : "please send more details"}${note ? `. "${note}"` : "."}`, createdById: req.user!.id });
      await writeAuditTx(db, { actorId: req.user!.id, action: "lostReport.review", entityType: "LostReport", entityId: u.id, metadata: { status } });
      return u;
    });
    ok(res, r);
  } catch (err) { next(err); }
});
