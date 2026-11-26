import { topMembers } from "./topMembers.js";
import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { ok } from "../../common/response.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { reportsWorkbook } from "./reports.export.js";

export const reportsRouter = Router();

reportsRouter.get("/summary", authenticate, requirePermission("reports:read"), async (_req, res, next) => {
  try {
    const [titles, copies, activeLoans, returnedLoans] = await Promise.all([
      prisma.book.count(),
      prisma.bookCopy.count(),
      prisma.borrowingTransaction.count({ where: { status: "ACTIVE" } }),
      prisma.borrowingTransaction.count({ where: { status: "RETURNED" } }),
    ]);
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 86400000);
    const [overdueLoans, members, dueThisWeek, pendingRequests, newSuggestions, pendingReviews] = await Promise.all([
      prisma.borrowingTransaction.count({ where: { status: "ACTIVE", dueAt: { lt: now } } }),
      prisma.user.count({ where: { isActive: true, role: { name: "MEMBER" } } }),
      // Due in the next 7 days (not yet overdue).
      prisma.borrowingTransaction.count({ where: { status: "ACTIVE", dueAt: { gte: now, lte: weekEnd } } }),
      prisma.borrowRequest.count({ where: { status: "PENDING" } }),
      prisma.suggestion.count({ where: { status: "NEW" } }),
      prisma.bookRating.count({ where: { reviewStatus: "PENDING" } }),
    ]);
    ok(res, { titles, copies, activeLoans, returnedLoans, overdueLoans, members, dueThisWeek, pendingRequests, newSuggestions, pendingReviews });
  } catch (err) { next(err); }
});

const PH_OFFSET_MS = 8 * 3600000; // Asia/Manila has no daylight saving time.
/** "2026-11" for the Philippine calendar month of a timestamp. */
export const phMonth = (d: Date) => new Date(d.getTime() + PH_OFFSET_MS).toISOString().slice(0, 7);

/** Reports > Statistics: borrows per month (last 12 Philippine months), by member role, and return outcomes. */
reportsRouter.get("/statistics", authenticate, requirePermission("reports:read"), async (_req, res, next) => {
  try {
    const now = new Date();
    const ph = new Date(now.getTime() + PH_OFFSET_MS);
    // Start of the Philippine month 11 months ago, as an absolute time.
    const since = new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth() - 11, 1) - PH_OFFSET_MS);
    // shortcut: aggregates in memory; fine for one school's yearly loans, move to SQL GROUP BY if it reaches ~100k rows.
    const loans = await prisma.borrowingTransaction.findMany({
      where: { borrowedAt: { gte: since } },
      select: { borrowedAt: true, status: true, outcome: true, borrower: { select: { memberType: true } } },
    });
    const months = Array.from({ length: 12 }, (_, i) => phMonth(new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth() - 11 + i, 15))));
    const monthly = new Map(months.map((m) => [m, 0]));
    const byRole: Record<string, number> = { Student: 0, Teacher: 0, "Not set": 0 };
    const byOutcome: Record<string, number> = {};
    for (const l of loans) {
      const m = phMonth(l.borrowedAt);
      if (monthly.has(m)) monthly.set(m, monthly.get(m)! + 1);
      const role = l.borrower?.memberType === "Student" || l.borrower?.memberType === "Teacher" ? l.borrower.memberType : "Not set";
      byRole[role] = (byRole[role] ?? 0) + 1;
      const outcome = l.status === "ACTIVE" ? "STILL_BORROWED" : l.outcome ?? "RETURNED_ON_TIME";
      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    }
    ok(res, { since, total: loans.length, monthly: [...monthly].map(([month, count]) => ({ month, count })), byRole, byOutcome });
  } catch (err) { next(err); }
});

/** Latest audit entries for the staff Dashboard "Recent activities" list. */
reportsRouter.get("/recent-activity", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit) || 8, 1), 50);
    const items = await prisma.auditLog.findMany({
      // Sign-in records are a security log, not library activity.
      where: { NOT: { action: { startsWith: "auth." } } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { username: true, displayName: true } } },
    });
    ok(res, { items });
  } catch (err) { next(err); }
});

/**
 * "Continue where you left off" (Dashboard): what this librarian did last, and the work still waiting, each with a
 * place to go. Counts only; nothing is changed.
 */
reportsRouter.get("/resume", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const now = new Date();
    const [mine, pendingRequests, takenNow, pendingReviews, newSuggestions, openAudit, cardsWaiting, overdue] = await Promise.all([
      prisma.auditLog.findMany({ where: { actorId: req.user!.id, NOT: { action: { startsWith: "auth." } } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, action: true, entityType: true, createdAt: true } }),
      prisma.borrowRequest.count({ where: { status: "PENDING" } }),
      prisma.borrowRequest.count({ where: { status: "PENDING", takenNow: true } }),
      prisma.bookRating.count({ where: { reviewStatus: "PENDING" } }),
      prisma.suggestion.count({ where: { status: "NEW" } }),
      prisma.inventoryAudit.findFirst({ where: { closedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true, note: true, _count: { select: { scans: true } } } }),
      prisma.user.count({ where: { role: { name: "MEMBER" }, isActive: true, cardPrintedAt: null, maskedId: { not: null } } }),
      prisma.borrowingTransaction.count({ where: { status: "ACTIVE", dueAt: { lt: now } } }),
    ]);
    ok(res, {
      lastActions: mine,
      waiting: { pendingRequests, takenNow, pendingReviews, newSuggestions, cardsWaiting, overdue },
      openAudit: openAudit ? { id: openAudit.id, startedAt: openAudit.startedAt, note: openAudit.note, scanned: openAudit._count.scans } : null,
    });
  } catch (err) { next(err); }
});

/** All report lists as one Excel file (from/to like the Reports page). */
reportsRouter.get("/export.xlsx", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const date = (v: unknown) => { const d = typeof v === "string" ? new Date(v) : undefined; return d && !isNaN(d.getTime()) ? d : undefined; };
    const body = await reportsWorkbook(date(req.query.from), date(req.query.to));
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="aklatone-reports-${day}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch (err) { next(err); }
});

const phDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(d);

/** Monday-Friday school week (Philippine time) that contains the given day; Saturday and Sunday show the week just ended. */
export function schoolWeek(day: string) {
  const noon = new Date(`${day}T12:00:00+08:00`);
  const dow = noon.getUTCDay(); // 0 Sun .. 6 Sat (noon PH is the same calendar day in UTC)
  const monday = new Date(noon.getTime() - ((dow + 6) % 7) * 86_400_000);
  return Array.from({ length: 5 }, (_, i) => phDate(new Date(monday.getTime() + i * 86_400_000)));
}

/** Books used this school week: borrowed and returned per day, the titles borrowed, and library visits. */
reportsRouter.get("/this-week", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const day = typeof req.query.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : phDate(new Date());
    const days = schoolWeek(day);
    const start = new Date(`${days[0]}T00:00:00+08:00`), end = new Date(`${days[4]}T23:59:59.999+08:00`);
    const [lent, returned, visits] = await Promise.all([
      prisma.borrowingTransaction.findMany({ where: { borrowedAt: { gte: start, lte: end }, status: { not: "CANCELLED" } }, orderBy: { borrowedAt: "asc" }, select: { borrowedAt: true, borrowerId: true, borrower: { select: { maskedId: true, memberType: true, gradeSection: true, department: true } }, bookCopy: { select: { barcode: true, book: { select: { id: true, title: true, authors: true, isbn: true, coverUrl: true } } } } } }),
      prisma.borrowingTransaction.findMany({ where: { returnedAt: { gte: start, lte: end } }, select: { returnedAt: true } }),
      prisma.libraryVisit.findMany({ where: { day: { in: days } }, select: { day: true, memberId: true } }),
    ]);
    const count = <T,>(list: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return m; };
    const lentBy = count(lent, (l) => phDate(l.borrowedAt)), backBy = count(returned, (r) => phDate(r.returnedAt!)), visitBy = count(visits, (v) => v.day);
    const titles = new Map<string, { id: string; title: string; authors: string | null; isbn: string | null; coverUrl: string | null; times: number }>();
    for (const l of lent) { const b = l.bookCopy.book; const t = titles.get(b.id) ?? { ...b, times: 0 }; t.times++; titles.set(b.id, t); }
    ok(res, {
      from: days[0], to: days[4],
      days: days.map((d) => ({ day: d, borrowed: lentBy.get(d) ?? 0, returned: backBy.get(d) ?? 0, visits: visitBy.get(d) ?? 0 })),
      totals: { borrowed: lent.length, returned: returned.length, titles: titles.size, borrowers: new Set(lent.map((l) => l.borrowerId)).size, visits: visits.length, visitors: new Set(visits.map((v) => v.memberId)).size },
      books: [...titles.values()].sort((a, b) => b.times - a.times || a.title.localeCompare(b.title)).slice(0, 20),
      // Who borrowed what, Monday to Friday (by Member ID, no names).
      loans: lent.map((l) => ({ at: l.borrowedAt, day: phDate(l.borrowedAt), memberId: l.borrower.maskedId, group: (l.borrower.memberType === "Teacher" ? l.borrower.department : l.borrower.gradeSection) ?? null, title: l.bookCopy.book.title, copy: l.bookCopy.barcode })),
    });
  } catch (err) { next(err); }
});

/** Most active members today, this school week or this month (Member ID, photo and grade-section only). */
reportsRouter.get("/top-members", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const period = req.query.period === "day" || req.query.period === "month" ? req.query.period : "week";
    ok(res, { period, ...(await topMembers(period, Math.min(Number(req.query.limit) || 10, 50))) });
  } catch (err) { next(err); }
});

reportsRouter.get("/copies-by-status", authenticate, requirePermission("reports:read"), async (_req, res, next) => {
  try {
    const groups = await prisma.bookCopy.groupBy({ by: ["status"], _count: { _all: true } });
    ok(res, groups.map((g) => ({ status: g.status, count: g._count._all })));
  } catch (err) { next(err); }
});

reportsRouter.get("/inventory", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const bookId = typeof req.query.bookId === "string" ? req.query.bookId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const where: Record<string, unknown> = {};
    if (bookId) where.bookId = bookId;
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.bookCopy.findMany({ where, include: { book: true }, orderBy: { createdAt: "desc" }, take, skip }),
      prisma.bookCopy.count({ where }),
    ]);
    ok(res, { items, total, limit: take, offset: skip });
  } catch (err) { next(err); }
});

reportsRouter.get("/circulation", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (from || to) where.borrowedAt = { ...(from && !isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !isNaN(to.getTime()) ? { lte: to } : {}) };
    const [total, active, returned, overdue] = await Promise.all([
      prisma.borrowingTransaction.count({ where }),
      prisma.borrowingTransaction.count({ where: { ...where, status: "ACTIVE" } }),
      prisma.borrowingTransaction.count({ where: { ...where, status: "RETURNED" } }),
      prisma.borrowingTransaction.count({ where: { ...where, status: "ACTIVE", dueAt: { lt: new Date() } } }),
    ]);
    ok(res, { total, active, returned, overdue });
  } catch (err) { next(err); }
});

reportsRouter.get("/popular-books", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const where: Record<string, unknown> = {};
    if (from || to) where.borrowedAt = { ...(from && !isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !isNaN(to.getTime()) ? { lte: to } : {}) };
    const groups = await prisma.borrowingTransaction.groupBy({ by: ["bookCopyId"], _count: { _all: true }, where });
    // Need map to book title; do a simple aggregation by book
    const copies = await prisma.bookCopy.findMany({ where: { id: { in: groups.map((g) => g.bookCopyId) } }, include: { book: { select: { id: true, title: true } } } });
    const map = new Map(copies.map((c) => [c.id, c.book?.title ?? "Unknown"]));
    const agg = new Map<string, number>();
    for (const g of groups) {
      const title = map.get(g.bookCopyId) ?? "Unknown";
      agg.set(title, (agg.get(title) ?? 0) + g._count._all);
    }
    const items = Array.from(agg.entries()).map(([title, count]) => ({ title, borrowCount: count })).sort((a, b) => b.borrowCount - a.borrowCount);
    ok(res, { items });
  } catch (err) { next(err); }
});

reportsRouter.get("/overdue", authenticate, requirePermission("reports:read"), async (req, res, next) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const [items, total] = await Promise.all([
      prisma.borrowingTransaction.findMany({
        where: { status: "ACTIVE", dueAt: { lt: new Date() } },
        include: { bookCopy: { include: { book: { select: { id: true, title: true } } } }, borrower: { select: { id: true, username: true, displayName: true, maskedId: true } } },
        orderBy: { dueAt: "asc" },
        take,
        skip,
      }),
      prisma.borrowingTransaction.count({ where: { status: "ACTIVE", dueAt: { lt: new Date() } } }),
    ]);
    const now = new Date();
    const withDays = items.map((t) => ({ ...t, daysOverdue: t.dueAt ? Math.floor((now.getTime() - new Date(t.dueAt).getTime()) / (1000 * 60 * 60 * 24)) : 0 }));
    ok(res, { items: withDays, total, limit: take, offset: skip });
  } catch (err) { next(err); }
});