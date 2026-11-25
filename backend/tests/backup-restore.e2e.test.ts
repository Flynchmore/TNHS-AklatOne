import { describe, it, expect } from "vitest";

// Real backup -> change -> restore on the E2E database. Opt-in because it replaces the whole database while it runs:
//   RUN_RESTORE_TEST=1 DATABASE_URL=<aklatone_e2e URL> REDIS_URL= npx vitest run tests/backup-restore.e2e.test.ts
const enabled = process.env.RUN_RESTORE_TEST === "1" && /\/aklatone_e2e(\?|$)/.test(process.env.DATABASE_URL ?? "");

describe.runIf(enabled)("backup and restore (aklatone_e2e)", () => {
  it("restores the database to the moment of the backup", async () => {
    const { dumpDatabase, pack, unpack, validateDump, restoreDatabase } = await import("../src/modules/backup/backup.service.js");
    const { prisma } = await import("../src/config/prisma.js");
    const file = pack(await dumpDatabase(), "Backup-Pass-1");
    const name = `restore-test-${Date.now()}`;
    await prisma.category.create({ data: { name, kind: "GENRE" } });
    expect(await prisma.category.count({ where: { name } })).toBe(1);
    const sql = unpack(file, "Backup-Pass-1");
    validateDump(sql);
    await restoreDatabase(sql);
    expect(await prisma.category.count({ where: { name } })).toBe(0);
  }, 120_000);
});
