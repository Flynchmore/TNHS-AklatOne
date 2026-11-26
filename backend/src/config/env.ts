import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("1d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  REDIS_URL: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  // Per signed-in member account per window (15 min).
  // Per member account per 15 min. 300 was too low for a normal session (badges, screens, screen time), so 1000.
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  // Per signed-in librarian/admin account per window.
  STAFF_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3000),
  // Per IP for requests without a token; one school Wi-Fi IP may carry hundreds of students.
  ANON_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3000),
  // Comma-separated web origins allowed to call the API (e.g. https://library.example.com). Empty = any origin (development).
  // The mobile (Capacitor) and desktop (Tauri) app origins are always allowed.
  CORS_ORIGINS: z.string().optional().transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
  // Number of reverse proxies in front of the API (nginx, Hostinger, Docker), so sign-in limits see the real client IP.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Database backups (Settings > Backup and Restore, and a daily automatic copy).
  BACKUP_DIR: z.string().default("backups"),
  // Book covers downloaded once from Open Library and kept here (modules/covers).
  COVER_DIR: z.string().default("covers"),
  // Files members send (lost-book apology / report documents), kept outside the web folder.
  UPLOAD_DIR: z.string().default("uploads"),
  // Optional full-rights database user for backups, restores and migrations; DATABASE_URL can then be a rows-only user.
  DATABASE_ADMIN_URL: z.string().optional(),
  BACKUP_AUTO: z.string().optional().transform((v) => v !== "false"),
  BACKUP_HOUR: z.coerce.number().int().min(0).max(23).default(2),
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),
  // When set, automatic and safety backups saved on the server are encrypted with this key (keep a copy somewhere safe).
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
  // Automatic "due soon" reminder (in-app + email), once per loan, at REMINDER_HOUR Philippine time.
  REMINDER_AUTO: z.string().optional().transform((v) => v !== "false"),
  REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  REMINDER_DAYS_BEFORE: z.coerce.number().int().min(0).max(7).default(1),
}).superRefine((e, ctx) => {
  if (e.NODE_ENV !== "production") return;
  if (e.JWT_SECRET.length < 32 || /change-me/i.test(e.JWT_SECRET)) {
    ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "Use a random secret of at least 32 characters in production (e.g. openssl rand -hex 32)." });
  }
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;