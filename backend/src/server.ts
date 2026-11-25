import type { AddressInfo } from "node:net";
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

// The port is read back from the socket so nothing from the env object (which also holds secrets) is logged.
const listeningPort = () => (server.address() as AddressInfo).port;
const server = app.listen(env.PORT, () => {
  logger.info({ port: listeningPort() }, "AklatOne backend listening");
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
  // Whether the Staff Web / Desktop still needs its first librarian account, and whether a recovery key exists.
  const librarians = db ? await prisma.user.count({ where: { role: { name: "LIBRARIAN" }, isActive: true } }).catch(() => -1) : -1;
  const recoveryKey = db ? await prisma.libraryRecovery.count().catch(() => 0) : 0;
  if (env.NODE_ENV === "production") {
    logger.info({ database: db, redis: redisUp, email: !!env.EMAIL_USER }, "AklatOne startup checks");
    return;
  }
  const tty = process.stdout.isTTY;
  const c = (code: string, s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  const ok = c("32", "✔"), warn = c("33", "⚠"), bad = c("31", "✖"), arrow = c("36", "➜");
  const base = `http://localhost:${listeningPort()}`;
  const lines = [
    " ",
    c("1;34", "  ┌──────────────────────────────────────────────┐"),
    c("1;34", "  │  ") + c("1", "AklatOne API is running") + c("1;34", "                     │"),
    c("1;34", "  └──────────────────────────────────────────────┘"),
    db ? `  ${ok} Database   connected` : `  ${bad} Database   NOT reachable. Start MariaDB and check DATABASE_URL in backend/.env`,
    !redis ? `  ${warn} Redis      not configured; sign-in limits are kept in memory`
      : redisUp ? `  ${ok} Redis      connected (shared sign-in limits)`
      : `  ${warn} Redis      not running; sign-in limits are kept in memory. Start it: docker start aklatone-redis`,
    env.EMAIL_USER ? `  ${ok} Email      configured (codes go to each account's email)` : `  ${warn} Email      not set; every emailed code is printed here as [DEV OTP]`,
    librarians === 0 ? `  ${warn} Librarian  none yet: open the Staff Web ${c("1", "/setup")} page to create it (print the recovery key it shows)`
      : librarians > 0 ? `  ${ok} Librarian  set up${recoveryKey ? "" : c("33", "  (no recovery key yet: Staff Web > Settings > Emergency recovery key)")}` : "",
    `  ${arrow} API        ${base}/api/v1`,
    `  ${arrow} Health     ${base}/health`,
    `  ${arrow} API docs   ${base}/api-docs`,
    " ",
    db ? c("1", "  Ready. Start an app from the project root (another terminal):") : c("1;31", "  The apps will not work until the database is running."),
    `    ${c("36", "npm run dev")}              Staff Web portal (librarian / admin) in the browser`,
    `    ${c("36", "npm run dev:desktop")}      Staff Desktop app (window; offline mode, Visitor's Log kiosk)`,
    `    ${c("36", "npm run android")}          Phone app on a USB-connected Android phone (Member or Librarian)`,
    `    ${c("36", "npm run android:share")}    Phone app for phones on the same Wi-Fi (QR code to download)`,
    c("2", "  npm run dev already starts this API; running it twice reuses the API that is running."),
    " ",
  ].filter((l) => l !== "");
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
