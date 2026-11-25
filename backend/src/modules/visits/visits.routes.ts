import { Router, type Request } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAudit } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { KIOSK_PERMISSION, signKioskToken, signToken, verifyPassword } from "../auth/auth.service.js";

/**
 * Visitor's Log (library attendance). A member scans their Library ID card (or types the Member ID) at the kiosk, or
 * scans the kiosk's QR code with the member app. The first scan of the Philippine day is Time In, the next one Time Out.
 * The kiosk screen only shows Member IDs and times (no names) because students walk past it.
 */
export const visitsRouter = Router();

/** A second scan this soon after the last one is the same person scanning twice by accident. */
export const REPEAT_MS = 60_000;
/** Offline kiosk scans may be uploaded later, but not older than this or from the future. */
const MAX_AGE_MS = 7 * 86_400_000;

export const phDay = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(d);

export type ScanResult = { action: "in" | "out" | "ignored"; visit: { id: string; day: string; timeIn: Date; timeOut: Date | null } };

/**
 * Records one scan for a member at time `at`: Time In, Time Out, or nothing for a repeat scan.
 * shortcut: two scans of the same member arriving in the same instant (live + offline upload) could both open a visit; rare with one kiosk, add a unique open-visit key if several kiosks are used.
 */
export async function recordScan(memberId: string, at: Date, source: "kiosk" | "phone"): Promise<ScanResult> {
  const day = phDay(at);
  return prisma.$transaction(async (db) => {
    const last = await db.libraryVisit.findFirst({ where: { memberId, day }, orderBy: { timeIn: "desc" } });
    if (last && !last.timeOut) {
      if (at.getTime() - last.timeIn.getTime() < REPEAT_MS) return { action: "ignored", visit: last };
      const visit = await db.libraryVisit.update({ where: { id: last.id }, data: { timeOut: at } });
      return { action: "out", visit };
    }
    if (last?.timeOut && at.getTime() - last.timeOut.getTime() < REPEAT_MS) return { action: "ignored", visit: last };
    // A visit left open on an earlier day keeps an empty Time Out ("no time out"); it is never guessed.
    const visit = await db.libraryVisit.create({ data: { memberId, day, timeIn: at, source } });
    return { action: "in", visit };
  });
}

const memberByCode = (code: string) =>
  prisma.user.findFirst({ where: { maskedId: code, role: { name: "MEMBER" } }, select: { id: true, isActive: true, maskedId: true } });

// --- kiosk session ---

/** The librarian turns this computer into the Visitor's Log kiosk; the returned token can only record visits. */
visitsRouter.post("/kiosk/start", authenticate, requirePermission("circulation:write"), async (req, res, next) => {
  try {
    await writeAudit({ actorId: req.user!.id, action: "visits.kiosk_start", entityType: "User", entityId: req.user!.id });
    ok(res, { token: signKioskToken(req.user!) }, "Visitor's Log started");
  } catch (err) { next(err); }
});

/** Leaving the kiosk needs the librarian's password (students use this screen). */
visitsRouter.post("/kiosk/exit", authenticate, requirePermission(KIOSK_PERMISSION), validate({ body: z.object({ password: z.string().min(1).max(128) }) }), async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { role: true } });
    // 400, not 401: the apps sign out on any 401, and a student typing a wrong password must not end the kiosk session.
    if (!u || !u.isActive || !(await verifyPassword(req.body.password, u.passwordHash))) return fail(res, 400, "Wrong password.");
    await writeAudit({ actorId: u.id, action: "visits.kiosk_exit", entityType: "User", entityId: u.id });
    ok(res, { token: signToken({ id: u.id, username: u.username, role: u.role.name, permissions: Array.isArray(u.role.permissions) ? (u.role.permissions as string[]) : [] }) }, "Visitor's Log closed");
  } catch (err) { next(err); }
});

// --- recording visits ---

const scanSchema = z.object({
  memberCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{6}$/, "A Member ID looks like CA123456"),
  // When the kiosk was offline: the time of the scan on the kiosk computer.
  at: z.coerce.date().optional(),
});

visitsRouter.post("/scan", authenticate, requirePermission(KIOSK_PERMISSION), validate({ body: scanSchema }), async (req, res, next) => {
  try {
    const { memberCode, at: when } = req.body as z.infer<typeof scanSchema>;
    const now = Date.now();
    const at = when ?? new Date(now);
    if (at.getTime() > now + 5 * 60_000 || now - at.getTime() > MAX_AGE_MS) return fail(res, 400, "The scan time is not valid (check the kiosk computer's clock).");
    const m = await memberByCode(memberCode);
    if (!m) return fail(res, 404, `No member has the Member ID ${memberCode}.`);
    if (!m.isActive) return fail(res, 409, `Member ID ${memberCode} is deactivated. Please see the librarian.`);
    const r = await recordScan(m.id, at, "kiosk");
    ok(res, { ...r, memberCode: m.maskedId });
  } catch (err) { next(err); }
});

/** Today's visits for the kiosk screen: Member ID and times only. */
visitsRouter.get("/today", authenticate, requirePermission(KIOSK_PERMISSION), async (_req, res, next) => {
  try {
    const visits = await prisma.libraryVisit.findMany({ where: { day: phDay(new Date()) }, orderBy: { timeIn: "desc" }, take: 300, select: { id: true, timeIn: true, timeOut: true, member: { select: { maskedId: true } } } });
    ok(res, { items: visits.map((v) => ({ id: v.id, memberCode: v.member.maskedId, timeIn: v.timeIn, timeOut: v.timeOut })) });
  } catch (err) { next(err); }
});

// --- phone check-in: the kiosk shows a QR that changes every 30 s, the member app scans it ---

const QR_SECRET = () => `${env.JWT_SECRET}:visit-qr`;
const QR_TTL_S = 60;
const WINDOW_MS = 30_000;

/** 6-digit code shown under the QR for typing (like an authenticator app): changes every 30 s, no table needed. */
export function visitShortCode(at: number): string {
  const h = createHmac("sha256", QR_SECRET()).update(`visit-code:${Math.floor(at / WINDOW_MS)}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}
// The current and the previous 30-s code are accepted, so a code is valid for 30-60 s (same as the QR).
const shortCodeValid = (code: string, now: number) =>
  [now, now - WINDOW_MS].some((t) => timingSafeEqual(Buffer.from(visitShortCode(t)), Buffer.from(code)));

visitsRouter.get("/kiosk/qr", authenticate, requirePermission(KIOSK_PERMISSION), (req, res) => {
  const token = jwt.sign({ typ: "visit-qr", kid: req.user!.id }, QR_SECRET(), { expiresIn: QR_TTL_S });
  ok(res, { code: `AKLATONE-VISIT:${token}`, shortCode: visitShortCode(Date.now()), expiresInSeconds: QR_TTL_S });
});

// The scanned QR (AKLATONE-VISIT:<token>) or the 6-digit code typed from the kiosk screen.
const phoneSchema = z.object({ code: z.string().trim().min(6).max(2000) });
// Wrong codes per member (after sign-in, so a forged token can't lock someone else; never per school IP).
// shortcut: in-memory counter, fine for the single API process; move to the Redis store if the API is ever clustered.
const phoneCodeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `visit-code:${(req as Request).user!.id}`,
  message: { success: false, message: "Too many wrong codes. Please wait 15 minutes, or scan your Library ID card at the kiosk." },
});

visitsRouter.post("/phone", authenticate, phoneCodeLimiter, validate({ body: phoneSchema }), async (req: Request, res, next) => {
  try {
    if (req.user!.role !== "MEMBER") return fail(res, 403, "Only members check in with the app.");
    const code = (req.body as z.infer<typeof phoneSchema>).code;
    if (/^\d{6}$/.test(code)) {
      if (!shortCodeValid(code, Date.now())) return fail(res, 400, "This code has expired or is wrong. Type the code shown on the library screen now.");
    } else {
      try {
        const p = jwt.verify(code.replace(/^AKLATONE-VISIT:/, ""), QR_SECRET(), { algorithms: ["HS256"] }) as { typ?: string };
        if (p.typ !== "visit-qr") throw new Error("wrong type");
      } catch {
        return fail(res, 400, "This QR code has expired or is not the library's. Scan the code on the library screen again.");
      }
    }
    const r = await recordScan(req.user!.id, new Date(), "phone");
    created(res, r);
  } catch (err) { next(err); }
});
