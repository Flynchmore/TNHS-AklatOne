import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { disconnectPrisma, prisma } from "./config/prisma.js";
import { redis, waitForRedis } from "./config/redis.js";
import { startBackupSchedule } from "./modules/backup/backup.service.js";
import { startReminderSchedule } from "./modules/notifications/reminders.service.js";
import { ensureMemberIds } from "./modules/users/memberId.js";

const app = createApp();
let stopBackups = () => {};
let stopReminders = () => {};

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "AklatOne backend listening");
  stopBackups = startBackupSchedule();
  stopReminders = startReminderSchedule();
  void ensureMemberIds().catch((err) => logger.error({ err }, "Could not create Member IDs"));
  void startupSummary();
});

/** Human-friendly check of everything the API depends on, printed once at start (dev only; production keeps JSON logs). */
async function startupSummary() {
  const [db, redisUp] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    waitForRedis(),
  ]);
  if (env.NODE_ENV === "production") {
    logger.info({ database: db, redis: redisUp, email: !!env.EMAIL_USER }, "AklatOne startup checks");
    return;
  }
  const tty = process.stdout.isTTY;
  const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  const ok = c("32", "✔"), warn = c("33", "⚠"), bad = c("31", "✖"), arrow = c("36", "➜");
  const base = `http://localhost:${env.PORT}`;
  const lines = [
    "",
    c("1;34", "  ┌──────────────────────────────────────────────┐"),
    c("1;34", "  │  ") + c("1", "AklatOne API is running") + c("1;34", "                     │"),
    c("1;34", "  └──────────────────────────────────────────────┘"),
    db ? `  ${ok} Database   connected` : `  ${bad} Database   NOT reachable. Start MariaDB and check DATABASE_URL in backend/.env`,
    !redis ? `  ${warn} Redis      not configured; sign-in limits are kept in memory`
      : redisUp ? `  ${ok} Redis      connected (shared sign-in limits)`
      : `  ${warn} Redis      not running; sign-in limits are kept in memory. Start it: docker start aklatone-redis`,
    env.EMAIL_USER ? `  ${ok} Email      configured` : `  ${warn} Email      not set; sign-in codes are printed here as [DEV OTP]`,
    `  ${arrow} API        ${base}/api/v1`,
    `  ${arrow} Health     ${base}/health`,
    `  ${arrow} API docs   ${base}/api-docs`,
    "",
    db ? c("1", "  Ready. You can now start the apps:") : c("1;31", "  The apps will not work until the database is running."),
    "    Staff Web       cd frontend && npm run dev",
    "    Staff Desktop   cd frontend && npm run dev:desktop",
    "    Member Mobile   bash frontend/scripts/run-android.sh",
    "    Everything      npm run dev   (from the project root: Redis + API + Staff Web)",
    "",
  ];
  console.log(lines.join("\n"));
}

const shutdown = async () => {
  logger.info("Shutting down");
  server.close();
  stopBackups();
  stopReminders();
  redis?.disconnect();
  await disconnectPrisma();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
