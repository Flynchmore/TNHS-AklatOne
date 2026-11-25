import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { ok, fail } from "../../common/response.js";
import { writeAudit } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { verifyPassword } from "../auth/auth.service.js";
import {
  dumpDatabase, fileName, listServerBackups, pack, readServerBackup, restoreDatabase, safeName,
  saveServerBackup, unpack, validateDump, withRestoreLock,
} from "./backup.service.js";

export const backupRouter = Router();
backupRouter.use(authenticate, requirePermission("backup:manage"));

/** Backups contain every member's personal data, so the staff member re-enters their own password each time. */
async function confirmIdentity(req: Request, password: string | undefined) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true, isActive: true } });
  if (!user?.isActive || !password || !(await verifyPassword(password, user.passwordHash))) {
    throw Object.assign(new Error("Your password is incorrect."), { status: 401 });
  }
}

const backupPassword = z.string().min(8, "Backup password must be at least 8 characters.").max(128);
const downloadSchema = z.object({ currentPassword: z.string().min(1).max(128), password: backupPassword.optional() });

const sendFile = (res: express.Response, name: string, body: Buffer) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
};

/** Download a fresh backup of the whole database. */
backupRouter.post("/download", validate({ body: downloadSchema }), async (req, res, next) => {
  try {
    const { currentPassword, password } = req.body as z.infer<typeof downloadSchema>;
    await confirmIdentity(req, currentPassword);
    const body = pack(await dumpDatabase(), password);
    await writeAudit({ actorId: req.user!.id, action: "backup.download", entityType: "Database", metadata: { encrypted: !!password, bytes: body.length } });
    sendFile(res, fileName("aklatone", !!password), body);
  } catch (err) { next(err); }
});

/** Backups kept on the server (daily automatic copies and the safety copy made before each restore). */
backupRouter.get("/files", (_req, res) => ok(res, { items: listServerBackups() }));

backupRouter.post("/files/:name/download", validate({ body: z.object({ currentPassword: z.string().min(1).max(128) }) }), async (req, res, next) => {
  try {
    const name = String(req.params.name);
    if (!safeName(name) || !listServerBackups().some((b) => b.name === name)) return fail(res, 404, "Backup not found");
    await confirmIdentity(req, req.body.currentPassword);
    await writeAudit({ actorId: req.user!.id, action: "backup.download", entityType: "Database", metadata: { serverFile: name } });
    sendFile(res, name, readServerBackup(name));
  } catch (err) { next(err); }
});

async function restore(req: Request, file: Buffer, backupPw: string | undefined, source: string) {
  const sql = unpack(file, backupPw);
  validateDump(sql);
  return withRestoreLock(async () => {
    const safety = await saveServerBackup("pre-restore");
    await restoreDatabase(sql);
    // Written after the restore, so the entry is kept in the restored data.
    await writeAudit({ actorId: null, action: "backup.restore", entityType: "Database", metadata: { source, safetyBackup: safety, by: req.user!.username } });
    return { restoredAt: new Date().toISOString(), safetyBackup: safety };
  });
}

const header = (req: Request, name: string) => (typeof req.headers[name] === "string" ? (req.headers[name] as string) : undefined);

/** Restore from an uploaded backup file (raw body). Typed confirmation + the staff member's password are required. */
backupRouter.post("/restore", express.raw({ type: () => true, limit: "200mb" }), async (req, res, next) => {
  try {
    if (header(req, "x-confirm") !== "RESTORE") return fail(res, 400, 'Type RESTORE to confirm.');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return fail(res, 400, "Choose a backup file.");
    await confirmIdentity(req, header(req, "x-current-password"));
    ok(res, await restore(req, req.body, header(req, "x-backup-password"), "upload"), "Database restored");
  } catch (err) { next(err); }
});

const fileRestoreSchema = z.object({ currentPassword: z.string().min(1).max(128), backupPassword: z.string().max(128).optional(), confirm: z.literal("RESTORE") });
backupRouter.post("/files/:name/restore", validate({ body: fileRestoreSchema }), async (req, res, next) => {
  try {
    const name = String(req.params.name);
    if (!safeName(name) || !listServerBackups().some((b) => b.name === name)) return fail(res, 404, "Backup not found");
    const { currentPassword, backupPassword } = req.body as z.infer<typeof fileRestoreSchema>;
    await confirmIdentity(req, currentPassword);
    ok(res, await restore(req, readServerBackup(name), backupPassword || env.BACKUP_ENCRYPTION_KEY || undefined, name), "Database restored");
  } catch (err) { next(err); }
});
