import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { URL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { setTimeout, clearTimeout } from "node:timers";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Database backup and restore with the MariaDB command-line tools (mariadb-dump / mariadb).
 * File format: gzip of a plain .sql dump; when a password is given the gzip is wrapped in AES-256-GCM:
 *   MAGIC(16) | salt(16) | iv(12) | auth tag(16) | ciphertext
 * shortcut: dumps are held in memory; fine for one school's library (a few MB), stream to disk if it ever exceeds ~100 MB.
 */
const MAGIC = Buffer.from("AKLATONE-BACKUP1");
const GZIP = Buffer.from([0x1f, 0x8b]);

export const backupDir = () => resolve(env.BACKUP_DIR);

function connection() {
  const u = new URL(env.DATABASE_ADMIN_URL || env.DATABASE_URL);
  return {
    args: ["--host", u.hostname === "localhost" ? "127.0.0.1" : u.hostname, "--port", u.port || "3306", "--user", decodeURIComponent(u.username)],
    database: u.pathname.slice(1).split("?")[0]!,
    // Passed through the environment, never on the command line (visible to other users in `ps`).
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) },
  };
}

function run(tool: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const c = connection();
    const child = spawn(tool, [...c.args, ...args, c.database], { env: c.env });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("error", (e) => reject(Object.assign(new Error(`${tool} is not installed on the server (${e.message})`), { status: 500 })));
    child.on("close", (code) => (code === 0 ? resolvePromise(Buffer.concat(out)) : reject(Object.assign(new Error(`${tool} failed: ${err.trim().slice(0, 300)}`), { status: 500 }))));
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

/** Full logical dump of the AklatOne database (consistent snapshot, no table locks). */
export const dumpDatabase = () => run("mariadb-dump", ["--single-transaction", "--routines", "--triggers", "--no-tablespaces", "--default-character-set=utf8mb4"]);

/** gzip, then optional password encryption. */
export function pack(sql: Buffer, password?: string): Buffer {
  const gz = gzipSync(sql);
  if (!password) return gz;
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  const body = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export const isEncrypted = (file: Buffer) => file.subarray(0, MAGIC.length).equals(MAGIC);

/** Accepts an encrypted backup, a .sql.gz or a plain .sql file and returns the SQL text. */
export function unpack(file: Buffer, password?: string): Buffer {
  let data = file;
  if (isEncrypted(file)) {
    if (!password) throw Object.assign(new Error("This backup is password-protected. Enter its backup password."), { status: 400 });
    const salt = file.subarray(16, 32), iv = file.subarray(32, 44), tag = file.subarray(44, 60);
    try {
      const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
      decipher.setAuthTag(tag);
      data = Buffer.concat([decipher.update(file.subarray(60)), decipher.final()]);
    } catch {
      throw Object.assign(new Error("Wrong backup password, or the file is damaged."), { status: 400 });
    }
  }
  if (data.subarray(0, 2).equals(GZIP)) {
    try { return gunzipSync(data); } catch { throw Object.assign(new Error("The backup file is damaged (cannot be unzipped)."), { status: 400 }); }
  }
  return data;
}

/**
 * Only AklatOne dumps of this database may be restored. Statements that switch or create databases are refused,
 * so a file can never write into another database on the same server (e.g. a different school system).
 */
export function validateDump(sql: Buffer): void {
  const text = sql.toString("utf8");
  for (const table of ["_prisma_migrations", "Book", "User", "BorrowingTransaction"]) {
    if (!text.includes(`CREATE TABLE \`${table}\``)) {
      throw Object.assign(new Error("This is not an AklatOne database backup (expected tables are missing)."), { status: 400 });
    }
  }
  if (/^\s*(USE\s|CREATE\s+DATABASE|DROP\s+DATABASE|GRANT\s|CREATE\s+USER|DROP\s+USER)/im.test(text)) {
    throw Object.assign(new Error("This backup contains statements that change databases or users, so it was refused."), { status: 400 });
  }
}

/** Replaces the current database contents with the dump, then applies any newer migrations. */
export async function restoreDatabase(sql: Buffer): Promise<void> {
  await run("mariadb", ["--default-character-set=utf8mb4"], sql);
  // A backup from an older version is brought up to the current schema.
  await new Promise<void>((ok, fail) => {
    const child = spawn("npx", ["prisma", "migrate", "deploy"], { cwd: resolve("."), env: { ...process.env, DATABASE_URL: env.DATABASE_ADMIN_URL || env.DATABASE_URL }, stdio: "ignore" });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error("The backup was restored, but the last update step did not finish. Ask the ICT coordinator to restart the AklatOne server."))));
  });
}

export const stamp = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "-").replace(":", "");
export const fileName = (prefix: string, encrypted: boolean) => `${prefix}-${stamp()}.sql.gz${encrypted ? ".enc" : ""}`;
/** Only plain file names from our own list; blocks path traversal. */
export const safeName = (name: string) => /^[A-Za-z0-9_.-]+\.sql\.gz(\.enc)?$/.test(name) && !name.includes("..");

/** Writes a backup into BACKUP_DIR (encrypted with BACKUP_ENCRYPTION_KEY when set) and returns its name. */
export async function saveServerBackup(prefix: "auto" | "pre-restore" | "manual"): Promise<string> {
  mkdirSync(backupDir(), { recursive: true });
  const name = fileName(prefix, !!env.BACKUP_ENCRYPTION_KEY);
  writeFileSync(join(backupDir(), name), pack(await dumpDatabase(), env.BACKUP_ENCRYPTION_KEY || undefined), { mode: 0o600 });
  return name;
}

export function listServerBackups() {
  try {
    return readdirSync(backupDir()).filter(safeName).map((name) => {
      const s = statSync(join(backupDir(), name));
      return { name, size: s.size, createdAt: s.mtime.toISOString(), encrypted: name.endsWith(".enc") };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

export const readServerBackup = (name: string) => readFileSync(join(backupDir(), name));

/** Keeps the newest `keep` automatic backups; manual and pre-restore copies are never pruned. */
export function pruneAutoBackups(keep = env.BACKUP_KEEP) {
  listServerBackups().filter((b) => b.name.startsWith("auto-")).slice(keep).forEach((b) => unlinkSync(join(backupDir(), b.name)));
}

// --- restore lock: while restoring, other requests get 503 instead of reading half-restored data ---
let restoring = false;
export const isRestoring = () => restoring;
export async function withRestoreLock<T>(fn: () => Promise<T>): Promise<T> {
  if (restoring) throw Object.assign(new Error("A restore is already running. Please wait."), { status: 409 });
  restoring = true;
  try { return await fn(); } finally { restoring = false; }
}

/** Milliseconds until the next BACKUP_HOUR:00 in Philippine time (UTC+8, no daylight saving). */
export function msUntilNextRun(now = Date.now(), hour = env.BACKUP_HOUR) {
  const ph = new Date(now + 8 * 3600_000);
  let next = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate(), hour) - 8 * 3600_000;
  if (next <= now) next += 24 * 3600_000;
  return next - now;
}

/** Daily automatic backup (started by server.ts, not by tests). */
export function startBackupSchedule(): () => void {
  if (!env.BACKUP_AUTO) return () => {};
  let timer: ReturnType<typeof setTimeout>;
  const plan = () => {
    timer = setTimeout(async () => {
      try {
        const name = await saveServerBackup("auto");
        pruneAutoBackups();
        logger.info({ name }, "Automatic database backup saved");
      } catch (err) {
        logger.error({ err }, "Automatic database backup failed");
      }
      plan();
    }, msUntilNextRun());
  };
  plan();
  return () => clearTimeout(timer);
}
