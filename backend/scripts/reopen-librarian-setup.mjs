// Last resort when the librarian account AND the recovery key are both lost. Run on the server only (needs server
// access, so only the ICT coordinator can do it):
//   docker compose exec api node scripts/reopen-librarian-setup.mjs --yes      (Hostinger VPS)
//   cd backend && node scripts/reopen-librarian-setup.mjs --yes                 (development)
// Every active librarian account is turned off and signed out (its email is freed), so the Staff Web shows the
// first-time "Set up the librarian account" page again. Members, books and records are not touched.
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

if (!process.argv.includes("--yes")) {
  console.error("This turns off the current librarian account(s) so a new one can be set up at /setup.\nRun again with --yes to continue.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required."); process.exit(1); }

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
try {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const old = await prisma.user.findMany({ where: { isActive: true, role: { name: "LIBRARIAN" } }, select: { id: true } });
  for (const o of old) {
    await prisma.user.update({ where: { id: o.id }, data: { isActive: false, sessionsRevokedAt: new Date(), email: null, username: `replaced-librarian-${stamp}-${o.id}` } });
  }
  await prisma.auditLog.create({ data: { action: "setup.reopened_by_server", entityType: "User", metadata: { replaced: old.map((o) => o.id) } } });
  console.log(`${old.length} librarian account(s) turned off. Open the Staff Web: it now shows "Set up the librarian account".`);
} finally {
  await prisma.$disconnect();
}
