import { prisma } from "../../config/prisma.js";

export type Period = "day" | "week" | "month";
const phDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(d);

/** Philippine-time range of today, this Monday-Friday school week, or this calendar month. */
export function periodRange(period: Period, now = new Date()): { from: string; to: string; start: Date; end: Date } {
  const today = phDay(now);
  let from = today, to = today;
  if (period === "week") {
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
