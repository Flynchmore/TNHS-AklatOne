import { prisma } from "../config/prisma.js";
import type { AuthUser } from "../modules/auth/auth.service.js";

/**
 * Checks a signed token against the database on every request: the account must still be active and the token must be
 * newer than the last revocation (deactivation, password change or reset). Role and permissions come from the
 * database, so a permission change applies without signing in again.
 */
const SEEN_EVERY_MS = 5 * 60_000; // "last active" is updated at most every 5 minutes per session

export async function loadSession(claims: AuthUser & { issuedAt?: number | undefined; kiosk?: boolean | undefined; sid?: string | undefined }): Promise<AuthUser | null> {
  // A signed-out session (Settings > Sign-in devices) ends its token at once.
  // Tokens without a session id (kiosk tokens, tokens issued before sessions existed) fall back to the checks below.
  if (claims.sid) {
    const s = await prisma.session.findUnique({ where: { id: claims.sid }, select: { userId: true, revokedAt: true, lastSeenAt: true } });
    if (!s || s.userId !== claims.id || s.revokedAt) return null;
    if (Date.now() - s.lastSeenAt.getTime() > SEEN_EVERY_MS) void prisma.session.update({ where: { id: claims.sid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const u = await prisma.user.findUnique({
    where: { id: claims.id },
    select: { username: true, isActive: true, sessionsRevokedAt: true, role: { select: { name: true, permissions: true } } },
  });
  if (!u || !u.isActive) return null;
  // issuedAt is in milliseconds; older tokens without it count from the start of their second (so they are revoked too).
  if (u.sessionsRevokedAt && (claims.issuedAt ?? 0) < u.sessionsRevokedAt.getTime()) return null;
  // A kiosk token (Visitor's Log) can only record visits, whatever the account that started it may do.
  if (claims.kiosk) return u.role.name === "MEMBER" ? null : { id: claims.id, username: u.username, role: "KIOSK", permissions: ["visits:kiosk"] };
  return { id: claims.id, username: u.username, role: u.role.name, permissions: Array.isArray(u.role.permissions) ? (u.role.permissions as string[]) : [], sid: claims.sid };
}

