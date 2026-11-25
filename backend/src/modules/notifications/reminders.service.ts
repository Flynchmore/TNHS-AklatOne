import { setTimeout, clearTimeout } from "node:timers";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { notifyTx } from "../../common/notify.js";
import { emailMember, noticeEmail } from "../../common/email.js";
import { msUntilNextRun } from "../backup/backup.service.js";

const PH = 8 * 3_600_000;
const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", weekday: "long", month: "short", day: "numeric", year: "numeric" });

/** End of the Philippine day `days` days after `now` (UTC instant). */
export function phDayEnd(now: Date, days: number) {
  const ph = new Date(now.getTime() + PH);
  return new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate() + days, 23, 59, 59, 999) - PH);
}

/**
 * Automatic "due soon" reminder: every active loan due by the end of the Philippine day REMINDER_DAYS_BEFORE days
 * from now gets one in-app alert (and an email when the member has one). Loans that already got a DUE_SOON notice,
 * from the librarian or from an earlier run, are skipped. Loans are taken earliest due first.
 */
export async function sendDueReminders(now = new Date(), daysBefore = env.REMINDER_DAYS_BEFORE): Promise<number> {
  const loans = await prisma.borrowingTransaction.findMany({
    where: { status: "ACTIVE", dueAt: { gt: now, lte: phDayEnd(now, daysBefore) } },
    orderBy: { dueAt: "asc" },
    include: { bookCopy: { include: { book: { select: { title: true, authors: true, isbn: true, coverUrl: true } } } } },
  });
  let sent = 0;
  for (const loan of loans) {
    const already = await prisma.notification.findFirst({ where: { userId: loan.borrowerId, transactionId: loan.id, type: "DUE_SOON" }, select: { id: true } });
    if (already) continue;
    const book = loan.bookCopy.book;
    const text = `Reminder: "${book.title}" is due on ${day(loan.dueAt!)}. Please return it to the library on or before that day.`;
    await prisma.$transaction((db) => notifyTx(db, { userId: loan.borrowerId, type: "DUE_SOON", title: "Return reminder", message: text, transactionId: loan.id, createdById: null }));
    void emailMember(loan.borrowerId, (m) => noticeEmail("DUE_SOON", text, m.displayName, book));
    sent++;
  }
  return sent;
}

/** Daily run at REMINDER_HOUR (Philippine time), started by server.ts. */
export function startReminderSchedule(): () => void {
  if (!env.REMINDER_AUTO) return () => {};
  let timer: ReturnType<typeof setTimeout>;
  const plan = () => {
    timer = setTimeout(async () => {
      try {
        const sent = await sendDueReminders();
        if (sent) logger.info({ sent }, "Automatic return reminders sent");
      } catch (err) {
        logger.error({ err }, "Automatic return reminders failed");
      }
      plan();
    }, msUntilNextRun(Date.now(), env.REMINDER_HOUR));
  };
  plan();
  return () => clearTimeout(timer);
}

