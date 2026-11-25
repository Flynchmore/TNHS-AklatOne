import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { ok, created, fail } from "../../common/response.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { writeAuditTx } from "../../common/audit.js";
import { editConflict } from "../../common/conflict.js";
import { isStrongPassword } from "../../common/passwordStrength.js";
import { sendWelcomeEmail } from "../../common/email.js";
import { hashPassword } from "../auth/auth.service.js";
import { newMemberId } from "./memberId.js";

export const usersRouter = Router();

// Staff "Members" page: librarians manage MEMBER accounts only (never staff accounts).
const memberFields = {
  id: true, username: true, displayName: true, email: true, memberType: true, gradeSection: true,
  department: true, position: true, gender: true, studentRowNo: true, isActive: true, createdAt: true, updatedAt: true, role: { select: { name: true } },
  // Profile photo the member set in the app (small JPEG data URL, ~30-60 KB; 20 per page).
  avatarUrl: true,
  // "Member ID" on the Library ID card, and when the card was printed.
  maskedId: true, cardPrintedAt: true,
} satisfies Prisma.UserSelect;

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const strongPassword = z.string().min(8).max(128).refine(isStrongPassword, "Use a stronger password (12+ characters, mixed case, numbers, symbols).");

const memberBase = {
  displayName: z.string().trim().min(1, "Name is required").max(100),
  // Required for every account: sign-in codes (2FA), activation and password codes go there.
  email: z.string().trim().toLowerCase().email("A valid email is required").max(191),
  memberType: z.enum(["Student", "Teacher"]),
  gradeSection: optText(50),
  department: optText(100),
  position: optText(100),
  gender: z.preprocess(blankToNull, z.enum(["Male", "Female", "Prefer not to say"]).nullable().optional()),
  studentRowNo: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(1).max(999).nullable().optional()),
};
const createMemberSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, dash and underscore only"),
  password: strongPassword,
  ...memberBase,
});
const updateMemberSchema = z.object({ ...memberBase, password: strongPassword.optional() }).partial();
const statusSchema = z.object({ isActive: z.boolean() });

/** Each role keeps only its own details: students have grade/section and class record no., teachers department and position. */
export const roleFields = (role: string | null | undefined) =>
  role === "Teacher" ? { gradeSection: null, studentRowNo: null } : role === "Student" ? { department: null, position: null } : {};

async function findMember(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, email: true, memberType: true, updatedAt: true, role: { select: { name: true } } } });
  return u && u.role.name === "MEMBER" ? u : null;
}

usersRouter.get("/", authenticate, requirePermission("users:read"), async (req, res, next) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = req.query.memberType === "Student" || req.query.memberType === "Teacher" ? req.query.memberType : undefined;
    const status = req.query.status === "active" ? true : req.query.status === "inactive" ? false : undefined;
    const where: Prisma.UserWhereInput = {
      role: { name: "MEMBER" },
      // Self-registered accounts appear once they are activated by their emailed code.
      activationPending: false,
      ...(type ? { memberType: type } : {}),
      ...(status !== undefined ? { isActive: status } : {}),
      ...(q ? { OR: [{ username: { contains: q } }, { displayName: { contains: q } }, { email: { contains: q } }, { gradeSection: { contains: q } }, { maskedId: { contains: q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where, take, skip, orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        select: { ...memberFields, _count: { select: { borrowed: { where: { status: "ACTIVE" } } } } },
      }),
      prisma.user.count({ where }),
    ]);
    // Tally: books out now (above) and every book ever lent, counted from the same loan records the member's app shows.
    const totals = await prisma.borrowingTransaction.groupBy({ by: ["borrowerId"], where: { borrowerId: { in: rows.map((r) => r.id) }, status: { not: "CANCELLED" } }, _count: { _all: true } });
    const totalBy = new Map(totals.map((t) => [t.borrowerId, t._count._all]));
    const items = rows.map(({ _count, ...u }) => ({ ...u, activeLoans: _count.borrowed, totalLoans: totalBy.get(u.id) ?? 0 }));
    ok(res, { items, total, limit: take, offset: skip });
  } catch (err) {
    next(err);
  }
});

// --- Library ID cards (Printing > Library ID cards) ---
const cardFields = { id: true, maskedId: true, displayName: true, memberType: true, gradeSection: true, department: true, cardPrintedAt: true } satisfies Prisma.UserSelect;

/** Active members whose card has not been marked as printed yet (new members), oldest first. */
usersRouter.get("/cards", authenticate, requirePermission("users:read"), async (_req, res, next) => {
  try {
    // Printed in batches of 500 (about 63 A4 pages); the next batch shows after these are marked as printed.
    const where: Prisma.UserWhereInput = { role: { name: "MEMBER" }, isActive: true, cardPrintedAt: null, maskedId: { not: null } };
    const [items, total] = await Promise.all([prisma.user.findMany({ where, orderBy: { createdAt: "asc" }, take: 500, select: cardFields }), prisma.user.count({ where })]);
    ok(res, { items, total });
  } catch (err) { next(err); }
});

const printedSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(500) });
/** The librarian confirms the cards came out of the printer; they then leave the waiting list (reprint from the member). */
usersRouter.post("/cards/printed", authenticate, requirePermission("users:write"), validate({ body: printedSchema }), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof printedSchema>;
    const r = await prisma.$transaction(async (db) => {
      const u = await db.user.updateMany({ where: { id: { in: ids }, role: { name: "MEMBER" } }, data: { cardPrintedAt: new Date() } });
      await writeAuditTx(db, { actorId: req.user!.id, action: "user.cards_printed", entityType: "User", metadata: { count: u.count } });
      return u;
    });
    ok(res, { marked: r.count }, "Cards marked as printed");
  } catch (err) { next(err); }
});

usersRouter.get("/:id", authenticate, requirePermission("users:read"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        ...memberFields,
        borrowed: {
          orderBy: { borrowedAt: "desc" }, take: 10,
          select: { id: true, status: true, outcome: true, receiptNo: true, borrowedAt: true, dueAt: true, returnedAt: true, bookCopy: { select: { book: { select: { title: true } } } } },
        },
      },
    });
    if (!user) return fail(res, 404, "User not found");
    ok(res, user);
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", authenticate, requirePermission("users:write"), validate({ body: createMemberSchema }), async (req, res, next) => {
  try {
    const { password, ...input } = req.body as z.infer<typeof createMemberSchema>;
    if (await prisma.user.findUnique({ where: { username: input.username } })) return fail(res, 409, "That username is already taken.");
    if (input.email && (await prisma.user.findUnique({ where: { email: input.email } }))) return fail(res, 409, "An account with this email already exists.");
    const role = await prisma.role.findUnique({ where: { name: "MEMBER" } });
    if (!role) return fail(res, 500, "MEMBER role is missing. Run the database seed first.");
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (db) => {
      // Zod leaves absent optional fields undefined, which Prisma treats as "not set".
      const data = { ...input, ...roleFields(input.memberType), passwordHash, roleId: role.id, maskedId: await newMemberId(input.displayName, input.username) } as Prisma.UserUncheckedCreateInput;
      const u = await db.user.create({ data, select: memberFields });
      await writeAuditTx(db, { actorId: req.user!.id, action: "user.create", entityType: "User", entityId: u.id, metadata: { memberType: u.memberType } });
      return u;
    });
    if (user.email) void sendWelcomeEmail(user.email, "created", user.displayName, user.username).catch(() => {});
    created(res, user);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", authenticate, requirePermission("users:write"), validate({ params: idParamSchema, body: updateMemberSchema }), async (req, res, next) => {
  try {
    const member = await findMember(req.params.id as string);
    if (!member) return fail(res, 404, "Member not found");
    const conflict = editConflict(req, member.updatedAt);
    if (conflict) return fail(res, 409, conflict);
    const { password, ...input } = req.body as z.infer<typeof updateMemberSchema>;
    if (input.email && input.email !== member.email && (await prisma.user.findUnique({ where: { email: input.email } }))) return fail(res, 409, "An account with this email already exists.");
    const data = { ...input, ...roleFields(input.memberType ?? member.memberType) } as Prisma.UserUpdateInput;
    if (password) { data.passwordHash = await hashPassword(password); data.sessionsRevokedAt = new Date(); }
    const user = await prisma.$transaction(async (db) => {
      const u = await db.user.update({ where: { id: member.id }, data, select: memberFields });
      await writeAuditTx(db, { actorId: req.user!.id, action: "user.update", entityType: "User", entityId: u.id, metadata: { fields: Object.keys(req.body).filter((k) => k !== "password"), passwordReset: !!password } });
      return u;
    });
    ok(res, user, "Member updated");
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id/status", authenticate, requirePermission("users:write"), validate({ params: idParamSchema, body: statusSchema }), async (req, res, next) => {
  try {
    const member = await findMember(req.params.id as string);
    if (!member) return fail(res, 404, "Member not found");
    const conflict = editConflict(req, member.updatedAt);
    if (conflict) return fail(res, 409, conflict);
    const { isActive } = req.body as z.infer<typeof statusSchema>;
    const user = await prisma.$transaction(async (db) => {
      // Deactivating signs the member out of every device at once.
      const u = await db.user.update({ where: { id: member.id }, data: isActive ? { isActive } : { isActive, sessionsRevokedAt: new Date() }, select: memberFields });
      await writeAuditTx(db, { actorId: req.user!.id, action: isActive ? "user.activate" : "user.deactivate", entityType: "User", entityId: u.id });
      return u;
    });
    ok(res, user, isActive ? "Member activated" : "Member deactivated");
  } catch (err) {
    next(err);
  }
});
