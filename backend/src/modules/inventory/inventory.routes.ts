import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma.js";
import { ok, created, fail } from "../../common/response.js";
import { writeAuditTx } from "../../common/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { idParamSchema } from "../../common/schemas.js";

/**
 * Inventory audit (stocktake). The librarian starts an audit, scans the copies found on the shelves (QR label, USB
 * scanner or typed code) and closes it. The report lists copies that should be on the shelf but were not scanned and
 * scanned copies whose record says otherwise. Copy statuses are never changed automatically: the librarian decides.
 */
export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

/** Copies expected on the shelf: everything except borrowed, lost and retired copies. */
const ON_SHELF = ["AVAILABLE", "DAMAGED"] as const;
const copySelect = { id: true, barcode: true, status: true, location: true, lastVerifiedAt: true, book: { select: { id: true, title: true, authors: true, isbn: true } } } as const;

async function openAudit() {
  return prisma.inventoryAudit.findFirst({ where: { closedAt: null }, orderBy: { startedAt: "desc" } });
}

async function report(auditId: string) {
  const audit = await prisma.inventoryAudit.findUnique({ where: { id: auditId } });
  if (!audit) return null;
  const [scans, expected, totalCopies] = await Promise.all([
    prisma.inventoryScan.findMany({ where: { auditId }, orderBy: { scannedAt: "desc" }, select: { scannedAt: true, bookCopy: { select: copySelect } } }),
    prisma.bookCopy.findMany({ where: { status: { in: [...ON_SHELF] }, inventoryScans: { none: { auditId } } }, orderBy: [{ book: { title: "asc" } }, { barcode: "asc" }], select: copySelect }),
    prisma.bookCopy.count({ where: { status: { not: "RETIRED" } } }),
  ]);
  return {
    audit,
    totals: { copies: totalCopies, scanned: scans.length, notFound: expected.length },
    scans: scans.map((s) => ({ scannedAt: s.scannedAt, ...s.bookCopy })),
    // Should be on the shelf, not scanned (yet).
    notFound: expected,
    // Scanned, but the record says the copy is out or gone: check the borrowing record or the copy status.
    mismatched: scans.filter((s) => !ON_SHELF.includes(s.bookCopy.status as (typeof ON_SHELF)[number])).map((s) => ({ scannedAt: s.scannedAt, ...s.bookCopy })),
  };
}

inventoryRouter.get("/audits", requirePermission("copies:read"), async (_req, res, next) => {
  try {
    const audits = await prisma.inventoryAudit.findMany({ orderBy: { startedAt: "desc" }, take: 20, include: { _count: { select: { scans: true } } } });
    ok(res, { items: audits.map(({ _count, ...a }) => ({ ...a, scanned: _count.scans })) });
  } catch (err) { next(err); }
});

inventoryRouter.post("/audits", requirePermission("copies:write"), validate({ body: z.object({ note: z.string().trim().max(255).optional() }) }), async (req, res, next) => {
  try {
    const current = await openAudit();
    if (current) return fail(res, 409, "An inventory audit is already in progress. Close it before starting a new one.");
    const audit = await prisma.$transaction(async (tx) => {
      const a = await tx.inventoryAudit.create({ data: { startedById: req.user!.id, note: req.body.note || null } });
      await writeAuditTx(tx, { actorId: req.user!.id, action: "inventory.start", entityType: "InventoryAudit", entityId: a.id });
      return a;
    });
    created(res, audit);
  } catch (err) { next(err); }
});

inventoryRouter.get("/audits/:id", requirePermission("copies:read"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const r = await report(req.params.id as string);
    if (!r) return fail(res, 404, "Inventory audit not found");
    ok(res, r);
  } catch (err) { next(err); }
});

const scanSchema = z.object({ code: z.string().trim().min(1).max(64) });
/** Record one scanned copy code. Scanning the same copy twice is harmless. */
inventoryRouter.post("/audits/:id/scan", requirePermission("copies:write"), validate({ params: idParamSchema, body: scanSchema }), async (req, res, next) => {
  try {
    const audit = await prisma.inventoryAudit.findUnique({ where: { id: req.params.id as string } });
    if (!audit) return fail(res, 404, "Inventory audit not found");
    if (audit.closedAt) return fail(res, 409, "This inventory audit is already closed.");
    const code = (req.body as z.infer<typeof scanSchema>).code;
    // Copy codes are stored upper case (serial numbers are); a typed code may not be.
    const copy = await prisma.bookCopy.findFirst({ where: { OR: [{ barcode: code }, { barcode: code.toUpperCase() }] }, select: copySelect });
    if (!copy) return fail(res, 404, `No copy has the code ${code}.`);
    const now = new Date();
    const existing = await prisma.inventoryScan.findUnique({ where: { auditId_bookCopyId: { auditId: audit.id, bookCopyId: copy.id } } });
    if (!existing) {
      await prisma.$transaction([
        prisma.inventoryScan.create({ data: { auditId: audit.id, bookCopyId: copy.id, scannedById: req.user!.id, scannedAt: now } }),
        prisma.bookCopy.update({ where: { id: copy.id }, data: { lastVerifiedAt: now } }),
      ]);
    }
    const warning = copy.status === "BORROWED" ? "Recorded as borrowed: check whether it was returned without being recorded."
      : copy.status === "LOST" ? "Recorded as lost: it was found. Update its status in Catalog > Copies."
      : copy.status === "RETIRED" ? "Recorded as retired." : null;
    ok(res, { copy: { ...copy, lastVerifiedAt: existing ? copy.lastVerifiedAt : now }, alreadyScanned: !!existing, warning });
  } catch (err) { next(err); }
});

inventoryRouter.post("/audits/:id/close", requirePermission("copies:write"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const audit = await prisma.inventoryAudit.findUnique({ where: { id: req.params.id as string } });
    if (!audit) return fail(res, 404, "Inventory audit not found");
    if (audit.closedAt) return fail(res, 409, "This inventory audit is already closed.");
    const r = (await report(audit.id))!;
    const closed = await prisma.$transaction(async (tx) => {
      const a = await tx.inventoryAudit.update({ where: { id: audit.id }, data: { closedAt: new Date() } });
      await writeAuditTx(tx, { actorId: req.user!.id, action: "inventory.close", entityType: "InventoryAudit", entityId: a.id, metadata: r.totals });
      return a;
    });
    ok(res, { ...closed, totals: r.totals }, "Inventory audit closed");
  } catch (err) { next(err); }
});

inventoryRouter.get("/audits/:id/export.xlsx", requirePermission("copies:read"), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const r = await report(req.params.id as string);
    if (!r) return fail(res, 404, "Inventory audit not found");
    const wb = new ExcelJS.Workbook();
    const ph = (d: Date | null) => (d ? d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "");
    const cols = [{ header: "Title", key: "title", width: 40 }, { header: "ISBN", key: "isbn", width: 16 }, { header: "Copy", key: "copy", width: 18 }, { header: "Status", key: "status", width: 12 }, { header: "Location", key: "location", width: 14 }, { header: "Scanned / last verified", key: "when", width: 22 }];
    const add = (name: string, rows: { barcode: string; status: string; location: string | null; lastVerifiedAt: Date | null; scannedAt?: Date; book: { title: string; isbn: string | null } }[]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.columns = cols;
      ws.getRow(1).font = { bold: true };
      rows.forEach((c) => ws.addRow({ title: c.book.title, isbn: c.book.isbn ?? "", copy: c.barcode, status: c.status, location: c.location ?? "", when: ph(c.scannedAt ?? c.lastVerifiedAt) }));
    };
    add("Not found", r.notFound);
    add("Check record", r.mismatched);
    add("Scanned", r.scans);
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(r.audit.startedAt);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="aklatone-inventory-${day}.xlsx"`);
    res.end(Buffer.from(await wb.xlsx.writeBuffer()));
  } catch (err) { next(err); }
});
