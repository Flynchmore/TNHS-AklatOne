import { prisma } from "../../config/prisma.js";
import { notifyTx } from "../../common/notify.js";
import { bookAvailableEmail, emailMember } from "../../common/email.js";
import { logger } from "../../config/logger.js";

/**
 * "Notify me when available": when a book has a copy on the shelf again (a return, a new copy, a copy set back to
 * Available), everyone waiting gets an app alert and an email, and their wait is removed. Best effort: never blocks
 * the action that freed the copy.
 */
export async function notifyWatchers(bookId: string): Promise<number> {
  try {
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { title: true, authors: true, isbn: true, coverUrl: true, isHidden: true, copies: { where: { status: "AVAILABLE" }, select: { id: true }, take: 1 } },
    });
    if (!book || book.isHidden || !book.copies.length) return 0;
    const watches = await prisma.bookWatch.findMany({ where: { bookId }, select: { id: true, userId: true } });
    if (!watches.length) return 0;
    await prisma.$transaction(async (db) => {
      for (const w of watches) {
        await notifyTx(db, { userId: w.userId, type: "BOOK_AVAILABLE", title: "Book available", message: `"${book.title}" is back on the shelf. Request it soon: copies go to whoever requests first.` });
      }
      await db.bookWatch.deleteMany({ where: { id: { in: watches.map((w) => w.id) } } });
    });
    for (const w of watches) void emailMember(w.userId, (m) => bookAvailableEmail(m.displayName, book));
    return watches.length;
  } catch (err) {
    logger.error({ err, bookId }, "Notify watchers failed");
    return 0;
  }
}
