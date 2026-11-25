import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";
import { categoryCreateSchema, categoryUpdateSchema } from "./category.schemas.js";
import { ok, created, fail } from "../../common/response.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { writeAuditTx } from "../../common/audit.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res, next) => {
  try {
    const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = Math.max(Number(req.query.offset) || 0, 0);
    const kind = ["SUBJECT", "WATTPAD", "GENRE"].includes(String(req.query.kind)) ? (String(req.query.kind) as "SUBJECT" | "WATTPAD" | "GENRE") : undefined;
    const where = kind ? { kind } : {};
    const [items, total] = await Promise.all([
      prisma.category.findMany({ where, orderBy: [{ kind: "asc" }, { name: "asc" }], take, skip }),
      prisma.category.count({ where }),
    ]);
    ok(res, { items, total, limit: take, offset: skip });
  } catch (err) { next(err); }
});

categoriesRouter.get("/:id", validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const item = await prisma.category.findUnique({ where: { id: req.params.id as string } });
    if (!item) return fail(res, 404, "Category not found");
    ok(res, item);
  } catch (err) { next(err); }
});

categoriesRouter.post("/", authenticate, requirePermission("categories:write"), validate({ body: categoryCreateSchema }), async (req, res, next) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const createdItem = await tx.category.create({ data: req.body });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "category.create", entityType: "Category", entityId: createdItem.id, metadata: { name: createdItem.name } });
      return createdItem;
    });
    created(res, item);
  } catch (err) { next(err); }
});

categoriesRouter.patch("/:id", authenticate, requirePermission("categories:write"), validate({ params: idParamSchema, body: categoryUpdateSchema }), async (req, res, next) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id: req.params.id as string }, data: req.body });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "category.update", entityType: "Category", entityId: updated.id, metadata: { name: updated.name } });
      return updated;
    });
    ok(res, item);
  } catch (err) { next(err); }
});

categoriesRouter.delete("/:id", authenticate, requirePermission("categories:write"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id: req.params.id as string } });
      await writeAuditTx(tx, { actorId: req.user?.id ?? null, action: "category.delete", entityType: "Category", entityId: req.params.id as string });
    });
    ok(res, null, "Deleted");
  } catch (err) { next(err); }
});