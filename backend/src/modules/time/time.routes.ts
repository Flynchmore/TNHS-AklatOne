import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ok, fail } from "../../common/response.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { phDay } from "../visits/visits.routes.js";

/**
 * Time Spent: (1) time using the apps (members and librarians), (2) time in the library from the Visitor's Log
 * (Time In to Time Out; visits without a Time Out are not counted), (3) how long borrowed books were kept.
 */
export const timeRouter = Router();
timeRouter.use(authenticate);

const DAY_S = 86_400;
const days = (n: number, end = new Date()) => Array.from({ length: n }, (_, i) => phDay(new Date(end.getTime() - (n - 1 - i) * DAY_S * 1000)));

const usageSchema = z.object({
  platform: z.enum(["mobile", "web", "desktop"]),
  // Seconds per Philippine day; the app sends what it collected since the last upload (also after being offline).
  days: z.array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), seconds: z.number().int().min(1).max(DAY_S) })).min(1).max(8),
});

timeRouter.post("/usage", validate({ body: usageSchema }), async (req, res, next) => {
  try {
    if (req.user!.role === "KIOSK") return fail(res, 403, "The kiosk does not record app time.");
    const { platform, days: entries } = req.body as z.infer<typeof usageSchema>;
    const allowed = new Set(days(8)); // today and the 7 days before
    for (const e of entries.filter((x) => allowed.has(x.day))) {
      const key = { userId_day_platform: { userId: req.user!.id, day: e.day, platform } };
      const cur = await prisma.appUsage.findUnique({ where: key, select: { seconds: true } });
      // A day never holds more than 24 hours, whatever a device sends.
      const seconds = Math.min(DAY_S, (cur?.seconds ?? 0) + e.seconds);
      await prisma.appUsage.upsert({ where: key, create: { userId: req.user!.id, day: e.day, platform, seconds }, update: { seconds } });
    }
    ok(res, { saved: true });
  } catch (err) { next(err); }
});

/** Time Spent of one person (the member app, and Members > View for the librarian). */
export async function personTime(userId: string, now = new Date()) {
  const week = days(7, now);
  const [usage, usageTotal, visits, loans] = await Promise.all([
    prisma.appUsage.groupBy({ by: ["day"], where: { userId, day: { in: week } }, _sum: { seconds: true } }),
    prisma.appUsage.aggregate({ where: { userId }, _sum: { seconds: true } }),
    prisma.libraryVisit.findMany({ where: { memberId: userId }, orderBy: { timeIn: "desc" }, select: { day: true, timeIn: true, timeOut: true } }),
    prisma.borrowingTransaction.findMany({ where: { borrowerId: userId, status: { in: ["ACTIVE", "RETURNED"] } }, orderBy: { borrowedAt: "desc" }, select: { borrowedAt: true, returnedAt: true, status: true, bookCopy: { select: { book: { select: { title: true } } } } } }),
  ]);
  const byDay = new Map(usage.map((u) => [u.day, u._sum.seconds ?? 0]));
  const closed = visits.filter((v) => v.timeOut);
  const visitSeconds = (list: typeof closed) => list.reduce((s, v) => s + Math.round((v.timeOut!.getTime() - v.timeIn.getTime()) / 1000), 0);
  const today = phDay(now);
  const returned = loans.filter((l) => l.status === "RETURNED" && l.returnedAt);
  const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (DAY_S * 1000);
  return {
    app: { days: week.map((day) => ({ day, seconds: byDay.get(day) ?? 0 })), totalSeconds: usageTotal._sum.seconds ?? 0 },
    library: {
      visits: visits.length,
      seconds: visitSeconds(closed),
      weekSeconds: visitSeconds(closed.filter((v) => week.includes(v.day))),
      averageSeconds: closed.length ? Math.round(visitSeconds(closed) / closed.length) : null,
      insideNow: visits.some((v) => v.day === today && !v.timeOut),
      recent: visits.slice(0, 10),
    },
    loans: {
      returned: returned.length,
      averageDays: returned.length ? Math.round((returned.reduce((s, l) => s + daysBetween(l.borrowedAt, l.returnedAt!), 0) / returned.length) * 10) / 10 : null,
      borrowedNow: loans.filter((l) => l.status === "ACTIVE").map((l) => ({ title: l.bookCopy.book.title, days: Math.floor(daysBetween(l.borrowedAt, now)) })),
    },
  };
}

timeRouter.get("/me", async (req, res, next) => {
  try { ok(res, await personTime(req.user!.id)); } catch (err) { next(err); }
});

timeRouter.get("/members/:id", requirePermission("users:read"), validate({ params: idParamSchema }), async (req, res, next) => {
  try { ok(res, await personTime(req.params.id as string)); } catch (err) { next(err); }
});

/** Reports: Time Spent for a date range (from/to as YYYY-MM-DD Philippine days, default the last 30 days). */
timeRouter.get("/summary", requirePermission("reports:read"), async (req, res, next) => {
  try {
    const d = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const to = d(req.query.to) ?? phDay(new Date());
    const from = d(req.query.from) ?? days(30)[0]!;
    if (from > to) return fail(res, 400, "The start date must be on or before the end date.");
    const inRange = { gte: from, lte: to };
    const usageBy = async (role: Prisma.RoleWhereInput) => {
      const r = await prisma.appUsage.aggregate({ where: { day: inRange, user: { role } }, _sum: { seconds: true } });
      const people = await prisma.appUsage.groupBy({ by: ["userId"], where: { day: inRange, user: { role } } });
      return { seconds: r._sum.seconds ?? 0, people: people.length };
    };
    const [members, librarians, visits, returned] = await Promise.all([
      usageBy({ name: "MEMBER" }),
      usageBy({ name: { in: ["LIBRARIAN", "ADMIN"] } }),
      prisma.libraryVisit.findMany({ where: { day: inRange }, select: { memberId: true, day: true, timeIn: true, timeOut: true } }),
      prisma.borrowingTransaction.findMany({ where: { status: "RETURNED", returnedAt: { not: null, gte: new Date(`${from}T00:00:00+08:00`), lte: new Date(`${to}T23:59:59.999+08:00`) } }, select: { borrowedAt: true, returnedAt: true } }),
    ]);
    const closed = visits.filter((v) => v.timeOut);
    const libSeconds = closed.reduce((s, v) => s + Math.round((v.timeOut!.getTime() - v.timeIn.getTime()) / 1000), 0);
    const perDay = new Map<string, number>();
    for (const v of visits) perDay.set(v.day, (perDay.get(v.day) ?? 0) + 1);
    ok(res, {
      from, to,
      app: { members, librarians },
      library: {
        visits: visits.length,
        visitors: new Set(visits.map((v) => v.memberId)).size,
        seconds: libSeconds,
        averageSeconds: closed.length ? Math.round(libSeconds / closed.length) : null,
        withoutTimeOut: visits.length - closed.length,
        perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
      },
      loans: {
        returned: returned.length,
        averageDays: returned.length ? Math.round((returned.reduce((s, l) => s + (l.returnedAt!.getTime() - l.borrowedAt.getTime()) / (DAY_S * 1000), 0) / returned.length) * 10) / 10 : null,
      },
    });
  } catch (err) { next(err); }
});
