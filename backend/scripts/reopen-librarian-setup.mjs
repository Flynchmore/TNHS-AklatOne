// Last resort when the librarian account AND the recovery key are both lost. Run on the server only (needs server
// access, so only the ICT coordinator can do it):
//   docker compose exec api node scripts/reopen-librarian-setup.mjs --yes      (Hostinger VPS)
//   cd backend && node scripts/reopen-librarian-setup.mjs --yes                 (development)
// Every active librarian account is deleted for good (fresh start: its email can be used again), so the Staff Web shows the
// first-time "Set up the librarian account" page again. Members, books and records are not touched.
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

if (!process.argv.includes("--yes")) {
  console.error("This deletes the current librarian account(s) so a new one can be set up at /setup.\nRun again with --yes to continue.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
try {
  const old = await prisma.user.findMany({ where: { isActive: true, role: { name: "LIBRARIAN" } }, select: { id: true } });
  for (const o of old) {
    // Same as the app's purgeUser (common/purgeUser.ts): anything that must stay is moved to "former-member" first.
    await prisma.$transaction(async (db) => {
      const role = await db.role.findUniqueOrThrow({ where: { name: "MEMBER" } });
      const keep = (await db.user.findUnique({ where: { username: "former-member" } }))
        ?? (await db.user.create({ data: { username: "former-member", displayName: "Former member", passwordHash: "$2b$10$" + "x".repeat(53), roleId: role.id, isActive: false, activationPending: false } }));
      await db.borrowingTransaction.updateMany({ where: { borrowerId: o.id }, data: { borrowerId: keep.id } });
      await db.borrowRequest.updateMany({ where: { memberId: o.id }, data: { memberId: keep.id } });
      await db.libraryVisit.updateMany({ where: { memberId: o.id }, data: { memberId: keep.id } });
      await db.user.delete({ where: { id: o.id } });
    });
  }
  await prisma.auditLog.create({ data: { action: "setup.reopened_by_server", entityType: "User", metadata: { replaced: old.map((o) => o.id) } } });
  console.log(`${old.length} librarian account(s) deleted. Open the Staff Web: it now shows "Set up the librarian account".`);
} finally {
  await prisma.$disconnect();
}
