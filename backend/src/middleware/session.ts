import { prisma } from "../config/prisma.js";
import type { AuthUser } from "../modules/auth/auth.service.js";

/**
 * Checks a signed token against the database on every request: the account must still be active and the token must be
 * newer than the last revocation (deactivation, password change or reset). Role and permissions come from the
 * database, so a permission change applies without signing in again.
 */
export async function loadSession(claims: AuthUser & { issuedAt?: number | undefined; kiosk?: boolean | undefined }): Promise<AuthUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: claims.id },
    select: { username: true, isActive: true, sessionsRevokedAt: true, role: { select: { name: true, permissions: true } } },
  });
  if (!u || !u.isActive) return null;
  // issuedAt is in milliseconds; older tokens without it count from the start of their second (so they are revoked too).
  if (u.sessionsRevokedAt && (claims.issuedAt ?? 0) < u.sessionsRevokedAt.getTime()) return null;
  // A kiosk token (Visitor's Log) can only record visits, whatever the account that started it may do.
  if (claims.kiosk) return u.role.name === "MEMBER" ? null : { id: claims.id, username: u.username, role: "KIOSK", permissions: ["visits:kiosk"] };
  return { id: claims.id, username: u.username, role: u.role.name, permissions: Array.isArray(u.role.permissions) ? (u.role.permissions as string[]) : [] };
}

