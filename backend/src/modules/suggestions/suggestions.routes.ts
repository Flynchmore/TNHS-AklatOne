import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { ok, created, fail } from "../../common/response.js";
import { notifyTx } from "../../common/notify.js";
import { writeAuditTx } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";

/**
 * Suggestion Box: members suggest books to add to the library or send feedback. Only librarians read them (members
 * are minors, so nothing is shown to other members), each member may send 5 a day, and the librarian answers with a
 * status (Planned, Added/Done, Declined) and an optional reply that reaches the member as an alert.
 */
export const suggestionsRouter = Router();
suggestionsRouter.use(authenticate);

export const DAILY_LIMIT = 5;
const STATUSES = ["NEW", "PLANNED", "DONE", "DECLINED"] as const;
const text = (max: number) => z.string().trim().max(max);

const createSchema = z.object({
  kind: z.enum(["BOOK", "FEEDBACK"]),
  title: text(150).min(2, "Please write at least 2 characters."),
  author: text(150).optional(),
  message: text(1000).optional(),
});

suggestionsRouter.post("/", validate({ body: createSchema }), async (req, res, next) => {
  try {
    if (req.user!.role !== "MEMBER") return fail(res, 403, "Only members use the Suggestion Box.");
    const since = new Date(Date.now() - 86_400_000);
    if ((await prisma.suggestion.count({ where: { memberId: req.user!.id, createdAt: { gte: since } } })) >= DAILY_LIMIT) {
      return fail(res, 429, `You can send up to ${DAILY_LIMIT} suggestions a day. Please try again tomorrow.`);
    }
    const b = req.body as z.infer<typeof createSchema>;
    const s = await prisma.suggestion.create({
      data: { memberId: req.user!.id, kind: b.kind, title: b.title, author: b.kind === "BOOK" ? b.author || null : null, message: b.message || null },
    });
    created(res, s);
  } catch (err) { next(err); }
});

/** The member's own suggestions with the librarian's answers. */
suggestionsRouter.get("/mine", async (req, res, next) => {
  try {
    const items = await prisma.suggestion.findMany({ where: { memberId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, kind: true, title: true, author: true, message: true, status: true, reply: true, repliedAt: true, createdAt: true } });
    ok(res, { items });
  } catch (err) { next(err); }
});

/** Librarian: suggestions with filters; newest first. Also returns how many are still NEW (nav badge). */
suggestionsRouter.get("/", requirePermission("circulation:read"), async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status as never) ? (req.query.status as string) : undefined;
    const kind = req.query.kind === "BOOK" || req.query.kind === "FEEDBACK" ? req.query.kind : undefined;
    const where = { ...(status ? { status } : {}), ...(kind ? { kind } : {}) };
    const [items, total, waiting] = await Promise.all([
      prisma.suggestion.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { member: { select: { id: true, displayName: true, maskedId: true, memberType: true, gradeSection: true, department: true } } } }),
      prisma.suggestion.count({ where }),
      prisma.suggestion.count({ where: { status: "NEW" } }),
    ]);
    ok(res, { items, total, waiting });
  } catch (err) { next(err); }
});

const answerSchema = z.object({ status: z.enum(STATUSES), reply: text(500).optional() });
const LABEL: Record<string, string> = { NEW: "received", PLANNED: "planned", DONE: "done", DECLINED: "declined" };

suggestionsRouter.patch("/:id", requirePermission("circulation:write"), validate({ params: idParamSchema, body: answerSchema }), async (req, res, next) => {
  try {
    const { status, reply } = req.body as z.infer<typeof answerSchema>;
    const cur = await prisma.suggestion.findUnique({ where: { id: req.params.id as string } });
    if (!cur) return fail(res, 404, "Suggestion not found");
    const updated = await prisma.$transaction(async (db) => {
      const s = await db.suggestion.update({ where: { id: cur.id }, data: { status, ...(reply !== undefined ? { reply: reply || null, repliedById: req.user!.id, repliedAt: new Date() } : {}) } });
      // Tell the member when the answer changes (status or a new reply).
      if (status !== cur.status || (reply && reply !== cur.reply)) {
        const what = cur.kind === "BOOK" ? `your suggestion "${cur.title}"` : `your feedback "${cur.title}"`;
        const done = cur.kind === "BOOK" && status === "DONE" ? "The book was added to the library" : `The librarian marked ${what} as ${LABEL[status]}`;
        await notifyTx(db, { userId: cur.memberId, type: "SUGGESTION_UPDATE", title: "Suggestion Box", message: `${done}.${reply ? ` Reply: ${reply}` : ""}`, createdById: req.user!.id });
      }
      await writeAuditTx(db, { actorId: req.user!.id, action: "suggestion.answer", entityType: "Suggestion", entityId: cur.id, metadata: { status } });
      return s;
    });
    ok(res, updated, "Suggestion updated");
  } catch (err) { next(err); }
});
