import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/auth.js";
import { idParamSchema } from "../../common/schemas.js";
import { ok, created, fail } from "../../common/response.js";

/** A member's hearted books and their own folders. Everything is scoped to the signed-in user. */
export const favouritesRouter = Router();
favouritesRouter.use(authenticate);

const bookBody = z.object({ bookId: z.string().cuid() });
const moveBody = z.object({ folderId: z.string().cuid().nullable() });
const folderBody = z.object({ name: z.string().trim().min(1).max(40) });
const bookParam = z.object({ bookId: z.string().cuid() });

const bookSelect = { id: true, title: true, authors: true, isbn: true, coverUrl: true, createdAt: true, categories: { select: { id: true, name: true, kind: true } } } as const;

favouritesRouter.get("/mine", async (req, res, next) => {
  try {
    const memberId = req.user!.id;
    const [items, folders] = await Promise.all([
      prisma.favourite.findMany({ where: { memberId, book: { isHidden: false } }, orderBy: { createdAt: "desc" }, select: { id: true, folderId: true, createdAt: true, book: { select: bookSelect } } }),
      prisma.favouriteFolder.findMany({ where: { memberId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, _count: { select: { favourites: true } } } }),
    ]);
    ok(res, { items, folders: folders.map(({ _count, ...f }) => ({ ...f, count: _count.favourites })) });
  } catch (err) { next(err); }
});

favouritesRouter.post("/", validate({ body: bookBody }), async (req, res, next) => {
  try {
    const { bookId } = req.body as z.infer<typeof bookBody>;
    if (!(await prisma.book.findUnique({ where: { id: bookId }, select: { id: true } }))) return fail(res, 404, "Book not found");
    // Hearting twice is harmless.
    const fav = await prisma.favourite.upsert({ where: { memberId_bookId: { memberId: req.user!.id, bookId } }, create: { memberId: req.user!.id, bookId }, update: {} });
    created(res, fav);
  } catch (err) { next(err); }
});

favouritesRouter.delete("/:bookId", validate({ params: bookParam }), async (req, res, next) => {
  try {
    const del = await prisma.favourite.deleteMany({ where: { memberId: req.user!.id, bookId: req.params.bookId as string } });
    if (del.count === 0) return fail(res, 404, "Not in your favourites");
    ok(res, { removed: true });
  } catch (err) { next(err); }
});

/** File a favourite in one of the member's folders, or take it out (folderId: null). */
favouritesRouter.patch("/:bookId", validate({ params: bookParam, body: moveBody }), async (req, res, next) => {
  try {
    const memberId = req.user!.id;
    const { folderId } = req.body as z.infer<typeof moveBody>;
    if (folderId && !(await prisma.favouriteFolder.findFirst({ where: { id: folderId, memberId }, select: { id: true } }))) return fail(res, 404, "Folder not found");
    const upd = await prisma.favourite.updateMany({ where: { memberId, bookId: req.params.bookId as string }, data: { folderId } });
    if (upd.count === 0) return fail(res, 404, "Not in your favourites");
    ok(res, { folderId });
  } catch (err) { next(err); }
});

favouritesRouter.post("/folders", validate({ body: folderBody }), async (req, res, next) => {
  try {
    const memberId = req.user!.id;
    const { name } = req.body as z.infer<typeof folderBody>;
    if (await prisma.favouriteFolder.count({ where: { memberId } }) >= 20) return fail(res, 409, "You can have up to 20 folders");
    if (await prisma.favouriteFolder.findFirst({ where: { memberId, name }, select: { id: true } })) return fail(res, 409, "You already have a folder with that name");
    created(res, await prisma.favouriteFolder.create({ data: { memberId, name }, select: { id: true, name: true } }));
  } catch (err) { next(err); }
});

/** Deletes the folder only; its books stay in the member's favourites. */
favouritesRouter.delete("/folders/:id", validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const del = await prisma.favouriteFolder.deleteMany({ where: { id: req.params.id as string, memberId: req.user!.id } });
    if (del.count === 0) return fail(res, 404, "Folder not found");
    ok(res, { deleted: true });
  } catch (err) { next(err); }
});
