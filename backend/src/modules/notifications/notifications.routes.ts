import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { idParamSchema } from "../../common/schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { notifyTx } from "../../common/notify.js";
import { sendNoticeEmail } from "../../common/email.js";

export const notificationsRouter = Router();

const overdueSchema = z.object({
  transactionId: z.string().cuid(),
  message: z.string().max(500).optional(),
});

notificationsRouter.get("/mine", authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    ok(res, { items, unread });
  } catch (err) { next(err); }
});

notificationsRouter.post("/read-all", authenticate, async (req, res, next) => {
  try {
    const upd = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    ok(res, { updated: upd.count });
  } catch (err) { next(err); }
});

notificationsRouter.post("/:id/read", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const upd = await prisma.notification.updateMany({ where: { id: req.params.id as string, userId: req.user!.id }, data: { readAt: new Date() } });
    if (upd.count === 0) return fail(res, 404, "Notification not found");
    ok(res, { updated: upd.count });
  } catch (err) { next(err); }
});

/** Member deletes one of their own update alerts. Librarian notices (overdue, reminders) stay until the book is handled. */
notificationsRouter.delete("/:id", authenticate, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const del = await prisma.notification.deleteMany({ where: { id: req.params.id as string, userId: req.user!.id, type: { notIn: ["OVERDUE", "DUE_SOON"] } } });
    if (del.count === 0) return fail(res, 404, "Alert not found or cannot be removed");
    ok(res, { deleted: true });
  } catch (err) { next(err); }
});

// Friendly date for members, e.g. "Nov 27, 2026" (server time zone).
// Philippine time regardless of the server's time zone.
const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/** Librarian notices to the borrower of a book that is still out: an overdue notice, or an advance "due soon" reminder. */
async function sendNotice(req: import("express").Request, res: import("express").Response, kind: "OVERDUE" | "DUE_SOON") {
  const { transactionId, message } = req.body as { transactionId: string; message?: string };
  const loan = await prisma.borrowingTransaction.findUnique({ where: { id: transactionId }, include: { bookCopy: { include: { book: { select: { title: true, authors: true, isbn: true, coverUrl: true } } } } } });
  if (!loan) return fail(res, 404, "Borrowed book not found");
  if (loan.status !== "ACTIVE") return fail(res, 409, "This book has already been returned");
  const title = loan.bookCopy.book.title;
  const due = loan.dueAt ? day(loan.dueAt) : "the due date";
  const text = message?.trim() || (kind === "OVERDUE"
    ? `"${title}" was due on ${due}. Please return it to the library as soon as possible.`
    : `Reminder: "${title}" is due on ${due}. Please return it to the library on or before that day.`);
  await prisma.$transaction(async (db) => {
    await notifyTx(db, { userId: loan.borrowerId, type: kind, title: kind === "OVERDUE" ? "Overdue book" : "Return reminder", message: text, transactionId, createdById: req.user!.id });
    await writeAuditTx(db, { actorId: req.user!.id, action: kind === "OVERDUE" ? "notification.overdue" : "notification.reminder", entityType: "BorrowingTransaction", entityId: transactionId });
  });
  // Also email the member when they have an email (the in-app alert is the record; email is best effort).
  const member = await prisma.user.findUnique({ where: { id: loan.borrowerId }, select: { email: true, displayName: true } });
  if (member?.email) void sendNoticeEmail(member.email, kind, text, member.displayName, loan.bookCopy.book).catch(() => {});
  return created(res, { sent: true });
}

/** Librarian sends an overdue notice to the borrower of a book that is still out. */
notificationsRouter.post("/overdue", authenticate, requirePermission("circulation:write"), validate({ body: overdueSchema }), async (req, res, next) => {
  try { await sendNotice(req, res, "OVERDUE"); } catch (err) { next(err); }
});

/** Librarian sends an advance reminder that a borrowed book is due soon. */
notificationsRouter.post("/reminder", authenticate, requirePermission("circulation:write"), validate({ body: overdueSchema }), async (req, res, next) => {
  try { await sendNotice(req, res, "DUE_SOON"); } catch (err) { next(err); }
});
