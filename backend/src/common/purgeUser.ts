import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";

/**
 * One shared stand-in for accounts that were deleted: their borrowing records and visits move here so the library's
 * counts and each copy's history stay correct, while the person's own account (name, email, username, photo, sessions,
 * favourites, reviews, files) is removed from the database. It has no email and can never sign in.
 */
export const FORMER_USERNAME = "former-member";

async function formerMemberId(db: Prisma.TransactionClient): Promise<string> {
  const found = await db.user.findUnique({ where: { username: FORMER_USERNAME }, select: { id: true } });
  if (found) return found.id;
  const role = await db.role.findUniqueOrThrow({ where: { name: "MEMBER" } });
  const u = await db.user.create({
    data: { username: FORMER_USERNAME, displayName: "Former member", passwordHash: await bcrypt.hash(randomUUID(), 10), roleId: role.id, isActive: false, activationPending: false },
  });
  return u.id;
}

/** Removes a user row for good (inside the caller's transaction). Returns the stored files to delete afterwards. */
export async function purgeUser(db: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const keep = await formerMemberId(db);
  await db.borrowingTransaction.updateMany({ where: { borrowerId: userId }, data: { borrowerId: keep } });
  await db.borrowRequest.updateMany({ where: { memberId: userId }, data: { memberId: keep } });
  await db.libraryVisit.updateMany({ where: { memberId: userId }, data: { memberId: keep } });
  const files = await db.lostReport.findMany({ where: { memberId: userId }, select: { storedAs: true } });
  // Everything else (sessions, alerts, favourites, ratings, views, app time, suggestions, waits, school-issued books,
  // lost-book reports) is deleted with the account (onDelete: Cascade); audit entries keep no link (SetNull).
  await db.user.delete({ where: { id: userId } });
  return files.map((f) => f.storedAs);
}

/** Deletes uploaded files of a purged user (after the transaction committed). */
export async function removeUserFiles(storedAs: string[]): Promise<void> {
  const dir = resolve(env.UPLOAD_DIR, "lost-reports");
  await Promise.all(storedAs.map((f) => rm(join(dir, f), { force: true }).catch(() => {})));
}
