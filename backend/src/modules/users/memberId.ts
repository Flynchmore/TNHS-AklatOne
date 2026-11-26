import { randomInt } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";

/**
 * Member ID ("masked ID" in the code): initials of the first and last name + 6 random digits, e.g. Juan Dela Cruz -> JC123456.
 * It identifies a member on the Library ID card, the QR code and the visitor log without personal data
 * (no LRN, address or birthday). Made once and never changed, so printed cards keep working after a name change.
 */
export function initials(name: string | null | undefined, username: string): string {
  const letters = (s: string) => s.normalize("NFD").replace(/[^A-Za-z\s]/g, "").toUpperCase().split(/\s+/).filter(Boolean);
  const words = letters(name ?? "");
  const pick = words.length >= 2 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? letters(username).join("") ?? "").slice(0, 2);
  return (pick + "XX").slice(0, 2);
}

/** A Member ID nobody has yet (crypto random digits; tries again on the rare clash). */
export async function newMemberId(name: string | null | undefined, username: string): Promise<string> {
  const prefix = initials(name, username);
  for (let i = 0; i < 20; i++) {
    const id = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    if (!(await prisma.user.findUnique({ where: { maskedId: id }, select: { id: true } }))) return id;
  }
  throw new Error("Could not make a unique Member ID");
}

export const MEMBER_ID_RE = /^[A-Z]{2}\d{6}$/;

/**
 * The Member ID the form showed while the name was typed (preview), if it still fits: same initials as the saved name
 * and nobody took it meanwhile. Otherwise a new one, so the saved ID is always unique.
 */
export async function pickMemberId(name: string | null | undefined, username: string, wanted?: string | null): Promise<string> {
  if (wanted && MEMBER_ID_RE.test(wanted) && wanted.slice(0, 2) === initials(name, username)
    && !(await prisma.user.findUnique({ where: { maskedId: wanted }, select: { id: true } }))) return wanted;
  return newMemberId(name, username);
}

/** Gives every member without a Member ID one (members created before the feature). Runs at server start. */
export async function ensureMemberIds(): Promise<number> {
  const missing = await prisma.user.findMany({ where: { maskedId: null, role: { name: "MEMBER" } }, select: { id: true, displayName: true, username: true } });
  for (const u of missing) {
    // Only fills an empty Member ID, so an ID is never replaced.
    await prisma.user.updateMany({ where: { id: u.id, maskedId: null }, data: { maskedId: await newMemberId(u.displayName, u.username) } });
  }
  if (missing.length) logger.info({ count: missing.length }, "Member IDs created for existing members");
  return missing.length;
}
