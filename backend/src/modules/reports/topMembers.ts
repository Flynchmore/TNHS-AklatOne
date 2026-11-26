import { prisma } from "../../config/prisma.js";

export type Period = "day" | "yesterday" | "week" | "month";
const phDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(d);

/** Philippine-time range of today, this Monday-Friday school week, or this calendar month. */
export function periodRange(period: Period, now = new Date()): { from: string; to: string; start: Date; end: Date } {
  const today = phDay(now);
  let from = today, to = today;
  if (period === "yesterday") { from = to = phDay(new Date(new Date(`${today}T12:00:00+08:00`).getTime() - 86_400_000)); }
  else if (period === "week") {
    const noon = new Date(`${today}T12:00:00+08:00`);
    const dow = noon.getUTCDay();
    const monday = new Date(noon.getTime() - ((dow + 6) % 7) * 86_400_000); // Saturday and Sunday show the week just ended
    from = phDay(monday); to = phDay(new Date(monday.getTime() + 4 * 86_400_000));
  } else if (period === "month") {
    from = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split("-").map(Number) as [number, number];
    to = phDay(new Date(Date.UTC(y, m, 0, 4)));
  }
  return { from, to, start: new Date(`${from}T00:00:00+08:00`), end: new Date(`${to}T23:59:59.999+08:00`) };
}

export interface TopMember { memberId: string; maskedId: string | null; memberType: string | null; group: string | null; avatarUrl: string | null; borrows: number; reviews: number; visits: number; score: number; books: string[] }

/**
 * Most active members in a period: books borrowed (3 points), reviews written (2) and library visits (1).
 * Only the Member ID, photo and grade-section / department come out (no names), for the librarian and the app.
 */
export async function topMembers(period: Period, limit = 10): Promise<{ from: string; to: string; items: TopMember[] }> {
  const { from, to, start, end } = periodRange(period);
  const [loans, reviews, visits] = await Promise.all([
    prisma.borrowingTransaction.findMany({ where: { borrowedAt: { gte: start, lte: end }, status: { not: "CANCELLED" } }, select: { borrowerId: true, bookCopy: { select: { book: { select: { title: true } } } } } }),
    prisma.bookRating.findMany({ where: { review: { not: null }, updatedAt: { gte: start, lte: end }, reviewStatus: { not: "HIDDEN" } }, select: { memberId: true } }),
    prisma.libraryVisit.findMany({ where: { day: { gte: from, lte: to } }, select: { memberId: true } }),
  ]);
  const stats = new Map<string, { borrows: number; reviews: number; visits: number; books: string[] }>();
  const of = (id: string) => { let s = stats.get(id); if (!s) { s = { borrows: 0, reviews: 0, visits: 0, books: [] }; stats.set(id, s); } return s; };
  for (const l of loans) { const s = of(l.borrowerId); s.borrows++; if (!s.books.includes(l.bookCopy.book.title)) s.books.push(l.bookCopy.book.title); }
  for (const r of reviews) of(r.memberId).reviews++;
  for (const v of visits) of(v.memberId).visits++;
  const ranked = [...stats].map(([id, s]) => ({ id, ...s, score: s.borrows * 3 + s.reviews * 2 + s.visits })).sort((a, b) => b.score - a.score || b.borrows - a.borrows).slice(0, limit); // the route caps it at 50
  const users = await prisma.user.findMany({ where: { id: { in: ranked.map((r) => r.id) }, role: { name: "MEMBER" }, isActive: true }, select: { id: true, maskedId: true, memberType: true, gradeSection: true, department: true, avatarUrl: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    from, to,
    items: ranked.filter((r) => byId.has(r.id)).map((r) => {
      const u = byId.get(r.id)!;
      return { memberId: u.id, maskedId: u.maskedId, memberType: u.memberType, group: (u.memberType === "Teacher" ? u.department : u.gradeSection) ?? null, avatarUrl: u.avatarUrl, borrows: r.borrows, reviews: r.reviews, visits: r.visits, score: r.score, books: r.books.slice(0, 5) };
    }),
  };
}

export interface ActivityItem { at: Date; kind: "borrowed" | "returned" | "requested" | "rated" | "visit" | "favourite" | "suggestion"; text: string }
const OUTCOME_TEXT: Record<string, string> = { RETURNED_ON_TIME: "on time", RETURNED_LATE: "late", DAMAGED: "torn / damaged", MISSING: "recorded as missing" };
const REQUEST_TEXT: Record<string, string> = { PENDING: "waiting for the librarian", APPROVED: "approved", REJECTED: "declined", CANCELLED: "cancelled" };

/** A member's own activity in a period (yesterday, today, this week, this month): newest first, plain sentences. */
export async function memberActivity(memberId: string, period: Period) {
  const { from, to, start, end } = periodRange(period);
  const inRange = { gte: start, lte: end };
  const [lent, back, requests, ratings, visits, favs, suggestions] = await Promise.all([
    prisma.borrowingTransaction.findMany({ where: { borrowerId: memberId, borrowedAt: inRange }, select: { borrowedAt: true, dueAt: true, bookCopy: { select: { book: { select: { title: true } } } } } }),
    prisma.borrowingTransaction.findMany({ where: { borrowerId: memberId, returnedAt: inRange }, select: { returnedAt: true, outcome: true, bookCopy: { select: { book: { select: { title: true } } } } } }),
    prisma.borrowRequest.findMany({ where: { memberId, createdAt: inRange }, select: { createdAt: true, status: true, takenNow: true, book: { select: { title: true } } } }),
    prisma.bookRating.findMany({ where: { memberId, updatedAt: inRange }, select: { updatedAt: true, stars: true, review: true, book: { select: { title: true } } } }),
    prisma.libraryVisit.findMany({ where: { memberId, day: { gte: from, lte: to } }, select: { timeIn: true, timeOut: true } }),
    prisma.favourite.findMany({ where: { memberId, createdAt: inRange }, select: { createdAt: true, book: { select: { title: true } } } }),
    prisma.suggestion.findMany({ where: { memberId, createdAt: inRange }, select: { createdAt: true, title: true, kind: true } }),
  ]);
  const items: ActivityItem[] = [
    ...lent.map((t) => ({ at: t.borrowedAt, kind: "borrowed" as const, text: `Borrowed "${t.bookCopy.book.title}"` })),
    ...back.map((t) => ({ at: t.returnedAt!, kind: "returned" as const, text: `Returned "${t.bookCopy.book.title}"${t.outcome && OUTCOME_TEXT[t.outcome] ? ` (${OUTCOME_TEXT[t.outcome]})` : ""}` })),
    ...requests.map((r) => ({ at: r.createdAt, kind: "requested" as const, text: `${r.takenNow ? "Took" : "Requested"} "${r.book.title}" · ${REQUEST_TEXT[r.status] ?? r.status.toLowerCase()}` })),
    ...ratings.map((r) => ({ at: r.updatedAt, kind: "rated" as const, text: `Rated "${r.book.title}" ${r.stars} star${r.stars === 1 ? "" : "s"}${r.review ? " and wrote a review" : ""}` })),
    ...visits.flatMap((v) => [{ at: v.timeIn, kind: "visit" as const, text: "Time In at the library" }, ...(v.timeOut ? [{ at: v.timeOut, kind: "visit" as const, text: "Time Out from the library" }] : [])]),
    ...favs.map((f) => ({ at: f.createdAt, kind: "favourite" as const, text: `Added "${f.book.title}" to Favourites` })),
    ...suggestions.map((g) => ({ at: g.createdAt, kind: "suggestion" as const, text: g.kind === "BOOK" ? `Suggested the book "${g.title}"` : `Sent feedback: ${g.title}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 200);
  return { from, to, items };
}
