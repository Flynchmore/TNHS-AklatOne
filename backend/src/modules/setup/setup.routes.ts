import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { ok, created } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { isStrongPassword } from "../../common/passwordStrength.js";
import { hashPassword, verifyPassword } from "../auth/auth.service.js";
import { librarianReplacedEmail, sendEmail, sendWelcomeEmail } from "../../common/email.js";
import { authenticate } from "../../middleware/auth.js";
import { fail } from "../../common/response.js";
import { recoveryKeyMatches, replaceRecoveryKey } from "./recovery.js";

// First-run bootstrap for Staff Web/Desktop: creates the single shared LIBRARIAN account.
// Only works while no librarian exists; afterwards it always answers 409.
export const setupRouter = Router();

const librarianSchema = z.object({
  name: z.string().trim().min(2).max(100),
  position: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(8).max(128).refine(isStrongPassword, { message: "Password is too weak. Use 12+ characters with uppercase, lowercase, numbers, and symbols." }),
});

// Only active librarians count: a deactivated (replaced) librarian reopens setup.
const librarianCount = () => prisma.user.count({ where: { role: { name: "LIBRARIAN" }, isActive: true } });

setupRouter.get("/status", async (_req, res, next) => {
  try {
    ok(res, { needsLibrarianSetup: (await librarianCount()) === 0 });
  } catch (err) { next(err); }
});

setupRouter.post("/librarian", validate({ body: librarianSchema }), async (req, res, next) => {
  try {
    const { name, position, department, email, password } = req.body as z.infer<typeof librarianSchema>;
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (db) => {
      // Lock the LIBRARIAN role row so two simultaneous setups cannot both create an account.
      const roles = await db.$queryRaw<{ id: string }[]>`SELECT id FROM Role WHERE name = 'LIBRARIAN' FOR UPDATE`;
      const roleId = roles[0]?.id;
      if (!roleId) throw Object.assign(new Error("LIBRARIAN role is missing. Run the database seed first."), { status: 500 });
      if ((await db.user.count({ where: { roleId, isActive: true } })) > 0) throw Object.assign(new Error("The librarian account has already been set up. Please sign in."), { status: 409 });
      if (await db.user.findFirst({ where: { OR: [{ email }, { username: email }] } })) throw Object.assign(new Error("An account with this email already exists."), { status: 409 });
      const u = await db.user.create({ data: { username: email, email, displayName: name, position, department, passwordHash, roleId } });
      await writeAuditTx(db, { actorId: u.id, action: "setup.librarian", entityType: "User", entityId: u.id });
      return { ...u, recoveryKey: await replaceRecoveryKey(db) };
    });
    void sendWelcomeEmail(email, "librarian", name, user.username).catch(() => {});
    // The emergency recovery key is shown only in this answer: the school prints it and keeps it safe.
    created(res, { username: user.username, displayName: user.displayName, position: user.position, department: user.department, recoveryKey: user.recoveryKey });
  } catch (err) { next(err); }
});

const recoverSchema = librarianSchema.extend({ recoveryKey: z.string().trim().min(20).max(60) });

/**
 * Emergency: nobody can sign in to the librarian account any more (password and email both lost). The school's
 * recovery key creates a new librarian account; every active librarian account is turned off and signed out (its
 * email is freed so it can be used again), they get an alert email, and a new recovery key is made.
 */
setupRouter.post("/recover", validate({ body: recoverSchema }), async (req, res, next) => {
  try {
    const { recoveryKey, name, position, department, email, password } = req.body as z.infer<typeof recoverSchema>;
    const passwordHash = await hashPassword(password);
    const result = await prisma.$transaction(async (db) => {
      const roles = await db.$queryRaw<{ id: string }[]>`SELECT id FROM Role WHERE name = 'LIBRARIAN' FOR UPDATE`;
      const roleId = roles[0]?.id;
      if (!roleId) throw Object.assign(new Error("LIBRARIAN role is missing. Run the database seed first."), { status: 500 });
      if (!(await recoveryKeyMatches(db, recoveryKey))) throw Object.assign(new Error("That recovery key is not valid."), { status: 400 });
      const old = await db.user.findMany({ where: { roleId, isActive: true }, select: { id: true, email: true, displayName: true } });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      for (const o of old) {
        await db.user.update({ where: { id: o.id }, data: { isActive: false, sessionsRevokedAt: new Date(), email: null, username: `replaced-librarian-${stamp}-${o.id}` } });
      }
      if (await db.user.findFirst({ where: { OR: [{ email }, { username: email }] } })) throw Object.assign(new Error("An account with this email already exists. Use another email."), { status: 409 });
      const u = await db.user.create({ data: { username: email, email, displayName: name, position, department, passwordHash, roleId } });
      await writeAuditTx(db, { actorId: u.id, action: "setup.recover", entityType: "User", entityId: u.id, metadata: { replaced: old.map((o) => o.id) } });
      return { user: u, old, recoveryKey: await replaceRecoveryKey(db) };
    });
    for (const o of result.old) if (o.email) { const m = librarianReplacedEmail(o.displayName, name); void sendEmail(o.email, m.subject, m.html).catch(() => {}); }
    void sendWelcomeEmail(email, "librarian", name, result.user.username).catch(() => {});
    created(res, { username: result.user.username, displayName: result.user.displayName, recoveryKey: result.recoveryKey });
  } catch (err) { next(err); }
});

const staffOnly = (role?: string) => role === "LIBRARIAN" || role === "ADMIN";

/** Staff Settings: when the current recovery key was made (never the key itself). */
setupRouter.get("/recovery-key", authenticate, async (req, res, next) => {
  try {
    if (!staffOnly(req.user?.role)) return fail(res, 403, "Librarians only");
    const row = await prisma.libraryRecovery.findUnique({ where: { id: 1 }, select: { createdAt: true } });
    ok(res, { createdAt: row?.createdAt ?? null });
  } catch (err) { next(err); }
});

/** Staff Settings: make a new recovery key (the old one stops working). Asks for the librarian's password again. */
setupRouter.post("/recovery-key", authenticate, validate({ body: z.object({ currentPassword: z.string().min(1).max(128) }) }), async (req, res, next) => {
  try {
    if (!staffOnly(req.user?.role)) return fail(res, 403, "Librarians only");
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
    if (!me || !(await verifyPassword(req.body.currentPassword, me.passwordHash))) return fail(res, 400, "Your password is incorrect.");
    const key = await prisma.$transaction(async (db) => {
      const k = await replaceRecoveryKey(db);
      await writeAuditTx(db, { actorId: req.user!.id, action: "setup.recovery_key", entityType: "LibraryRecovery", entityId: "1" });
      return k;
    });
    ok(res, { recoveryKey: key }, "New recovery key made");
  } catch (err) { next(err); }
});
