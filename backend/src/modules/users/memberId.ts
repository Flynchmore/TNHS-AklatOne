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
