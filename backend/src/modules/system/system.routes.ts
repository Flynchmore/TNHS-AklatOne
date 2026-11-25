import { Router } from "express";
import { statfs } from "node:fs/promises";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { redis, redisReady } from "../../config/redis.js";
import { ok } from "../../common/response.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { backupDir, listServerBackups, msUntilNextRun } from "../backup/backup.service.js";

export const systemRouter = Router();
const startedAt = new Date();

/** Settings > System status: is everything the library depends on working? No secrets are returned. */
systemRouter.get("/status", authenticate, requirePermission("backup:manage"), async (_req, res, next) => {
  try {
    let database: { ok: boolean; version?: string | undefined; lastMigration?: string | null; error?: string };
    try {
      const [v] = await prisma.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
      const [m] = await prisma.$queryRaw<{ name: string }[]>`SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      database = { ok: true, version: v?.v, lastMigration: m?.name ?? null };
    } catch {
      database = { ok: false, error: "The database is not answering." };
    }
    const backups = listServerBackups();
    const lastAuto = backups.find((b) => b.name.startsWith("auto-")) ?? null;
    let disk: { freeBytes: number; totalBytes: number } | null = null;
    try { const s = await statfs(backupDir()); disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }; } catch { /* folder not created yet */ }
    ok(res, {
      serverTime: new Date().toISOString(),
      startedAt: startedAt.toISOString(),
      environment: env.NODE_ENV,
      database,
      // Redis is optional: without it, sign-in limits are counted in this server's memory.
      redis: !redis ? "not configured" : redisReady() ? "connected" : "unavailable (using memory)",
      email: !!(env.EMAIL_USER && env.EMAIL_PASS),
      backups: {
        automatic: env.BACKUP_AUTO,
        encrypted: !!env.BACKUP_ENCRYPTION_KEY,
        nextAutomatic: env.BACKUP_AUTO ? new Date(Date.now() + msUntilNextRun()).toISOString() : null,
        lastAutomatic: lastAuto ? { name: lastAuto.name, createdAt: lastAuto.createdAt } : null,
        count: backups.length,
        totalBytes: backups.reduce((n, b) => n + b.size, 0),
        disk,
      },
    });
  } catch (err) { next(err); }
});
