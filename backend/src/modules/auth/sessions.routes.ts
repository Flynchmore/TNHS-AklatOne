import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { ok, fail } from "../../common/response.js";
import { writeAudit } from "../../common/audit.js";
import { sendEmail, sendOtpEmail, newDeviceEmail } from "../../common/email.js";
import { authenticate } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { type AuthUser, signToken, verifyPassword, newOtp, otpHash, otpMatches } from "./auth.service.js";

/** A readable device name from the browser's User-Agent and the app's X-AklatOne-App header. */
export function deviceLabel(userAgent = "", app = ""): string {
  const ua = userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iPhone / iPad" : /Windows/i.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : /Linux|X11/i.test(ua) ? "Linux" : "an unknown system";
  if (app === "android" || app === "ios") return `AklatOne app on ${os}`;
  if (app === "desktop") return `AklatOne Desktop on ${os}`;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  return `${browser} on ${os}`;
}

const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;
/**
 * Where a sign-in came from. Only the IP address is known (no outside location service is used, so members' IP
 * addresses are never sent to a third party); a private address means the same network as the server, e.g. the school Wi-Fi.
 */
export function networkLabel(ip: string | null | undefined): string {
  if (!ip) return "Unknown network";
  return PRIVATE_IP.test(ip) ? `School / local network (${ip})` : `Internet (IP address ${ip})`;
}

/** How long a sign-in token lives (JWT_EXPIRES_IN: "1d", "12h", "30m" or seconds). Older sessions cannot be in use. */
export function tokenLifetimeMs(v: string | number = env.JWT_EXPIRES_IN): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(String(v).trim());
  const unit: Record<string, number> = { "": 1000, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return m ? Number(m[1]) * unit[m[2]!]! : 86_400_000;
}
const KEEP_SESSIONS_MS = 90 * 86_400_000; // session rows are kept 90 days (for "new device" alerts), then deleted

const clientIp = (req: Request) => (req.ip ?? "").replace(/^::ffff:/, "").slice(0, 64) || null;

/**
 * Records a new sign-in and returns its token. The first sign-in on a device the account has not used before sends a
 * "New sign-in" email (only for new devices: Gmail allows about 500 emails a day, and members sign in often).
 */
export async function openSession(user: AuthUser, req: Request): Promise<string> {
  const device = deviceLabel(req.get("user-agent") ?? "", req.get("x-aklatone-app") ?? "").slice(0, 120);
  const ip = clientIp(req);
  const [sameDevice, earlier] = await Promise.all([
    prisma.session.count({ where: { userId: user.id, device } }),
    prisma.session.count({ where: { userId: user.id } }),
  ]);
  const session = await prisma.session.create({ data: { userId: user.id, device, ip } });
  // Now and then (about 1 sign-in in 100) remove rows older than 90 days, so the table does not grow forever.
  if (Math.random() < 0.01) void prisma.session.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_SESSIONS_MS) } } }).catch(() => {});
  if (earlier > 0 && sameDevice === 0) void alertNewDevice(user.id, device, ip).catch(() => {});
  return signToken(user, session.id);
}

async function alertNewDevice(userId: string, device: string, ip: string | null) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
  if (!u?.email) return;
  const m = newDeviceEmail(u.displayName, { device, network: networkLabel(ip) });
  await sendEmail(u.email, m.subject, m.html);
}

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);
// The Visitor's Log kiosk token is not a person's sign-in.
sessionsRouter.use((req, res, next) => (req.user!.role === "KIOSK" ? fail(res, 403, "Not available on the kiosk.") : next()));

/** The account's signed-in devices, newest activity first; `current` marks this device. */
sessionsRouter.get("/", async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { sessionsRevokedAt: true } });
    const items = await prisma.session.findMany({
      // A password change or reset ends every older session, even if its row was never marked.
      // (This device stays listed after "sign out all other devices", which gives it a fresh token.)
      // Only sessions whose token can still be valid (or that a password change ended), plus this device always.
      where: {
        userId: req.user!.id,
        revokedAt: null,
        OR: [
          { createdAt: { gte: new Date(Math.max(Date.now() - tokenLifetimeMs(), u?.sessionsRevokedAt?.getTime() ?? 0)) } },
          ...(req.user!.sid ? [{ id: req.user!.sid }] : []),
        ],
      },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
      select: { id: true, device: true, ip: true, createdAt: true, lastSeenAt: true },
    });
    ok(res, { items: items.map(({ ip, ...s }) => ({ ...s, network: networkLabel(ip), current: s.id === req.user!.sid })) });
  } catch (err) { next(err); }
});

/** Sends the 6-digit code that confirms signing a device out (accounts with an email). */
sessionsRouter.post("/code", async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, displayName: true, username: true } });
    if (!u?.email) return ok(res, { needsCode: false });
    const otp = newOtp();
    await prisma.user.update({ where: { id: req.user!.id }, data: { otpCode: otpHash(otp), otpExpiry: new Date(Date.now() + 10 * 60_000) } });
    const sent = await sendOtpEmail(u.email, otp, "session", u.displayName);
    if (!sent && env.NODE_ENV !== "production") console.log(`[DEV OTP] device sign-out ${u.username}: ${otp}`);
    ok(res, { needsCode: true, email: u.email.replace(/^(.)[^@]*(@.*)$/, "$1***$2") });
  } catch (err) { next(err); }
});

// Wrong password or code per account (after sign-in, so nobody can lock someone else out).
// shortcut: in-memory counter, fine for the single API process; move to the Redis store if the API is ever clustered.
const revokeLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `revoke:${(req as Request).user!.id}`,
  message: { success: false, message: "Too many wrong attempts. Please wait 15 minutes." },
});
const revokeSchema = z.object({
  sessionId: z.string().cuid().optional(),
  others: z.literal(true).optional(),
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/).optional(),
}).refine((d) => Number(!!d.sessionId) + Number(!!d.others) === 1, { message: "Choose one device, or all other devices", path: ["sessionId"] });

/**
 * Signs out one device, or every other device. Needs the account password and, for accounts with an email, the code
 * from POST /code. Wrong answers are 400 (never 401: the apps sign out on 401).
 */
sessionsRouter.post("/revoke", revokeLimiter, validate({ body: revokeSchema }), async (req, res, next) => {
  try {
    const { sessionId, password, code } = req.body as z.infer<typeof revokeSchema>; // no sessionId = every other device
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true, email: true, otpCode: true, otpExpiry: true } });
    if (!u || !(await verifyPassword(password, u.passwordHash))) return fail(res, 400, "Wrong password.");
    if (u.email) {
      if (!code || !u.otpCode || !u.otpExpiry || u.otpExpiry < new Date() || !otpMatches(u.otpCode, code)) return fail(res, 400, "Wrong or expired code. Ask for a new one.");
      await prisma.user.update({ where: { id: req.user!.id }, data: { otpCode: null, otpExpiry: null } });
    }
    const now = new Date();
    if (sessionId) {
      const r = await prisma.session.updateMany({ where: { id: sessionId, userId: req.user!.id, revokedAt: null }, data: { revokedAt: now } });
      if (!r.count) return fail(res, 404, "That device is already signed out.");
      await writeAudit({ actorId: req.user!.id, action: "auth.session_revoke", entityType: "Session", entityId: sessionId, metadata: { ip: req.ip } });
      return ok(res, { signedOut: 1, current: sessionId === req.user!.sid });
    }
    // Every other device: mark their sessions, and end older tokens without a session id too. This device gets a fresh token.
    const r = await prisma.session.updateMany({ where: { userId: req.user!.id, revokedAt: null, ...(req.user!.sid ? { id: { not: req.user!.sid } } : {}) }, data: { revokedAt: now } });
    await prisma.user.update({ where: { id: req.user!.id }, data: { sessionsRevokedAt: now } });
    await writeAudit({ actorId: req.user!.id, action: "auth.session_revoke_others", entityType: "User", entityId: req.user!.id, metadata: { ip: req.ip, count: r.count } });
    const token = req.user!.sid ? signToken(req.user!, req.user!.sid) : await openSession(req.user!, req);
    ok(res, { signedOut: r.count, token });
  } catch (err) { next(err); }
});
