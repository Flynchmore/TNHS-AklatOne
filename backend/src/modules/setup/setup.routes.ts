import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { ok, created } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { isStrongPassword } from "../../common/passwordStrength.js";
import { hashPassword } from "../auth/auth.service.js";
import { sendWelcomeEmail } from "../../common/email.js";

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
      return u;
    });
    void sendWelcomeEmail(email, "librarian", name, user.username).catch(() => {});
    created(res, { username: user.username, displayName: user.displayName, position: user.position, department: user.department });
  } catch (err) { next(err); }
});
