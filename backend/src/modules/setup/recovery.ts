import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

// Recovery key: 25 random characters (about 125 bits) shown as AKLT-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX; letters that look
// alike (0/O, 1/I/L) are left out so it can be typed from paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const normalize = (key: string) => key.toUpperCase().replace(/^AKLT/, "").replace(/[^A-Z0-9]/g, "");
const hash = (key: string) => createHash("sha256").update(normalize(key)).digest("hex");

export function newRecoveryKey(): string {
  const chars = [...randomBytes(25)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `AKLT-${chars.match(/.{5}/g)!.join("-")}`;
}

/** Saves a new key (only its hash) and returns it for the school to print; the old key stops working. */
export async function replaceRecoveryKey(db: Prisma.TransactionClient): Promise<string> {
  const key = newRecoveryKey();
  await db.libraryRecovery.upsert({ where: { id: 1 }, create: { id: 1, keyHash: hash(key) }, update: { keyHash: hash(key), createdAt: new Date() } });
  return key;
}

export async function recoveryKeyMatches(db: Prisma.TransactionClient, key: string): Promise<boolean> {
  const row = await db.libraryRecovery.findUnique({ where: { id: 1 } });
  if (!row || normalize(key).length !== 25) return false;
  const a = Buffer.from(row.keyHash), b = Buffer.from(hash(key));
  return a.length === b.length && timingSafeEqual(a, b);
}
