import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { BOOK_TYPES, bookCreateSchema } from "./book.schemas.js";

/**
 * Excel import/export of the book catalog.
 * Only the known columns below are read; any other column is reported as ignored and never changes the database schema.
 */
type Field = "title" | "authors" | "isbn" | "serialNumber" | "publisher" | "publishedYear" | "bookType" | "gradeLevel" | "subject" | "wattpad" | "genre" | "description" | "copies" | "hidden";
const COLUMNS: { field: Field; header: string; aliases: string[] }[] = [
  { field: "title", header: "Title", aliases: ["book title", "title of book", "pamagat"] },
  { field: "authors", header: "Author", aliases: ["authors", "author(s)", "may-akda"] },
  { field: "isbn", header: "ISBN", aliases: ["isbn no", "isbn number"] },
  { field: "serialNumber", header: "Serial No.", aliases: ["serial", "serial no", "serial number", "accession no", "accession number", "call number"] },
  { field: "publisher", header: "Publisher", aliases: ["publishers"] },
  { field: "publishedYear", header: "Year", aliases: ["year published", "published year", "publication year", "copyright"] },
  { field: "bookType", header: "Book type", aliases: ["type", "type of book", "material type"] },
  { field: "gradeLevel", header: "Grade level", aliases: ["grade", "level", "baitang"] },
  { field: "subject", header: "Subject", aliases: [] },
  { field: "wattpad", header: "Wattpad", aliases: [] },
  { field: "genre", header: "Genre", aliases: [] },
  { field: "description", header: "Description", aliases: ["summary", "notes"] },
  { field: "copies", header: "Copies", aliases: ["no of copies", "number of copies", "quantity", "qty"] },
  { field: "hidden", header: "Hidden", aliases: [] },
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9()]+/g, " ").trim();
const HEADER_MAP = new Map<string, Field>(COLUMNS.flatMap((c) => [[norm(c.header), c.field] as const, ...c.aliases.map((a) => [norm(a), c.field] as const)]));
const KIND = { subject: "SUBJECT", wattpad: "WATTPAD", genre: "GENRE" } as const;
const BOOK_FIELDS = ["title", "authors", "isbn", "serialNumber", "publisher", "publishedYear", "bookType", "gradeLevel", "description"] as const;

/** Spreadsheet spellings of a book type / grade level ("textbook", "7", "Grade 07", "all") to the app's values. */
export function normBookType(v?: string): string | undefined {
  if (!v) return v;
  const k = v.toLowerCase().replace(/[^a-z]/g, "");
  return BOOK_TYPES.find((t) => t.toLowerCase().replace(/[^a-z]/g, "") === k) ?? (/manual/.test(k) ? "Teacher's Manual" : /worksheet|activity|module/.test(k) ? "Worksheet" : /text/.test(k) ? "Textbook" : v);
}
export function normGradeLevel(v?: string): string | undefined {
  if (!v) return v;
  if (/^all/i.test(v.trim())) return "All grade levels";
  const n = Number(v.replace(/\D/g, ""));
  return n >= 7 && n <= 12 ? `Grade ${n}` : v;
}
type BookField = (typeof BOOK_FIELDS)[number];
const LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.field, c.header]));

export const MAX_ROWS = 5000;
/** Plain-language row errors for librarians (zod's own messages are technical). */
const FRIENDLY: Record<string, string> = {
  title: "Title is required (up to 255 characters).",
  publishedYear: "Year must be a whole number, e.g. 2015.",
  copies: "Copies must be a whole number from 0 to 50.",
  isbn: "ISBN can have at most 20 characters.",
  authors: "Author can have at most 255 characters.",
  publisher: "Publisher can have at most 255 characters.",
  bookType: "Book type must be Textbook, Teacher's Manual, Worksheet or Other.",
  gradeLevel: "Grade level must be Grade 7 to Grade 12, or All grade levels.",
  description: "Description can have at most 2000 characters.",
};

/** Text of any cell type (numbers, dates, rich text, hyperlinks, formula results). */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return String(v.getUTCFullYear());
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return cellText(v.text as ExcelJS.CellValue);
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
  }
  return "";
}

export interface ImportRow {
  row: number;
  /** Only the columns present in the file; a blank cell means "no change" for an existing book. */
  values: Partial<Record<Field, string>>;
}

/** Reads the first worksheet. Header row = first row with a recognised Title column (within the first 10 rows). */
export async function parseWorkbook(buf: Buffer): Promise<{ rows: ImportRow[]; columns: Field[]; ignoredColumns: string[] }> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw Object.assign(new Error("This is not a valid Excel (.xlsx) file."), { status: 400 }); }
  const ws = wb.worksheets[0];
  if (!ws) throw Object.assign(new Error("The Excel file has no sheets."), { status: 400 });
  let headerRow = 0;
  const colField = new Map<number, Field>();
  const ignoredColumns: string[] = [];
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    const found = new Map<number, Field>();
    ws.getRow(r).eachCell((cell, col) => { const f = HEADER_MAP.get(norm(cellText(cell.value))); if (f && ![...found.values()].includes(f)) found.set(col, f); });
    if ([...found.values()].includes("title")) {
      headerRow = r;
      found.forEach((f, c) => colField.set(c, f));
      ws.getRow(r).eachCell((cell, col) => { const t = cellText(cell.value); if (t && !colField.has(col)) ignoredColumns.push(t); });
    }
  }
  if (!headerRow) throw Object.assign(new Error('No "Title" column found. Download the template to see the expected columns.'), { status: 400 });
  const rows: ImportRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values: ImportRow["values"] = {};
    let any = false;
    for (const [col, f] of colField) { const t = cellText(ws.getRow(r).getCell(col).value); values[f] = t; if (t) any = true; }
    if (!any) continue;
    rows.push({ row: r, values });
    if (rows.length > MAX_ROWS) throw Object.assign(new Error(`Too many rows (more than ${MAX_ROWS}). Split the file.`), { status: 400 });
  }
  return { rows, columns: [...colField.values()], ignoredColumns };
}

type Db = PrismaClient | Prisma.TransactionClient;
type ExistingBook = { id: string; title: string; authors: string | null; isbn: string | null; serialNumber: string | null; publisher: string | null; publishedYear: number | null; bookType: string | null; gradeLevel: string | null; description: string | null; isHidden: boolean; categories: { id: string; kind: string }[]; _count: { copies: number } };

export interface PlannedCreate { row: number; data: Record<BookField, unknown>; categoryIds: string[]; copies: number; hidden: boolean }
export interface PlannedUpdate { row: number; id: string; title: string; changes: { field: string; from: string; to: string }[]; data: Partial<Record<BookField, unknown>>; categoryIds?: string[]; addCopies: number; isHidden?: boolean }
export interface ImportPlan {
  create: PlannedCreate[];
  update: PlannedUpdate[];
  hide: { id: string; title: string; authors: string | null; isbn: string | null }[];
  unchanged: number;
  errors: { row: number; message: string }[];
}

const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const show = (v: unknown) => (v == null || v === "" ? "(blank)" : String(v));

/** Works out what the import would do against the current catalog. Called for the preview and again inside the apply transaction. */
export async function planImport(db: Db, rows: ImportRow[]): Promise<ImportPlan> {
  const [books, cats] = await Promise.all([
    db.book.findMany({ select: { id: true, title: true, authors: true, isbn: true, serialNumber: true, publisher: true, publishedYear: true, bookType: true, gradeLevel: true, description: true, isHidden: true, categories: { select: { id: true, kind: true } }, _count: { select: { copies: true } } } }) as Promise<ExistingBook[]>,
    db.category.findMany({ select: { id: true, name: true, kind: true } }),
  ]);
  const byIsbn = new Map(books.filter((b) => b.isbn).map((b) => [key(b.isbn), b]));
  const bySerial = new Map(books.filter((b) => b.serialNumber).map((b) => [key(b.serialNumber), b]));
  const byTitleAuthor = new Map(books.map((b) => [`${key(b.title)}|${key(b.authors)}`, b]));
  const catId = new Map(cats.map((c) => [`${c.kind}|${key(c.name)}`, c.id]));

  const plan: ImportPlan = { create: [], update: [], hide: [], unchanged: 0, errors: [] };
  const matched = new Set<string>();
  const seenIsbn = new Map<string, number>(), seenSerial = new Map<string, number>();

  for (const { row, values } of rows) {
    const v = values;
    // Same validation as the Add Book form.
    const parsed = bookCreateSchema.safeParse({
      title: v.title ?? "", authors: v.authors, isbn: v.isbn, serialNumber: v.serialNumber, publisher: v.publisher,
      publishedYear: v.publishedYear, bookType: normBookType(v.bookType), gradeLevel: normGradeLevel(v.gradeLevel), description: v.description, copies: v.copies || undefined,
    });
    if (!parsed.success) {
      const i = parsed.error.issues[0]!;
      const f = String(i.path[0]);
      plan.errors.push({ row, message: FRIENDLY[f] ?? `${LABEL[f] ?? f}: ${i.message}` });
      continue;
    }
    const d = parsed.data;
    const hiddenText = key(v.hidden);
    if (hiddenText && !["yes", "no", "y", "n", "true", "false", "1", "0"].includes(hiddenText)) { plan.errors.push({ row, message: 'Hidden: use "Yes" or "No"' }); continue; }
    const hidden = hiddenText ? ["yes", "y", "true", "1"].includes(hiddenText) : undefined;

    let catError = "";
    const rowCats: { kind: string; id: string | null }[] = [];
    for (const f of ["subject", "wattpad", "genre"] as const) {
      if (v[f] === undefined || v[f] === "") continue;
      const id = catId.get(`${KIND[f]}|${key(v[f])}`);
      if (!id) { catError = `${LABEL[f]} "${v[f]}" does not exist. Add it in Categories first, or fix the spelling.`; break; }
      rowCats.push({ kind: KIND[f], id });
    }
    if (catError) { plan.errors.push({ row, message: catError }); continue; }

    const isbnKey = key(d.isbn), serialKey = key(d.serialNumber);
    if (isbnKey && seenIsbn.has(isbnKey)) { plan.errors.push({ row, message: `ISBN ${d.isbn} is also on row ${seenIsbn.get(isbnKey)}` }); continue; }
    if (serialKey && seenSerial.has(serialKey)) { plan.errors.push({ row, message: `Serial No. ${d.serialNumber} is also on row ${seenSerial.get(serialKey)}` }); continue; }

    const existing = (isbnKey && byIsbn.get(isbnKey)) || (serialKey && bySerial.get(serialKey)) || byTitleAuthor.get(`${key(d.title)}|${key(d.authors)}`);
    if (existing && matched.has(existing.id)) { plan.errors.push({ row, message: `Matches the same book ("${existing.title}") as an earlier row` }); continue; }
    // An ISBN / serial in the row may not belong to a different book.
    const isbnOwner = isbnKey ? byIsbn.get(isbnKey) : undefined, serialOwner = serialKey ? bySerial.get(serialKey) : undefined;
    if (isbnOwner && existing && isbnOwner.id !== existing.id) { plan.errors.push({ row, message: `ISBN ${d.isbn} belongs to another book ("${isbnOwner.title}")` }); continue; }
    if (serialOwner && existing && serialOwner.id !== existing.id) { plan.errors.push({ row, message: `Serial No. ${d.serialNumber} belongs to another book ("${serialOwner.title}")` }); continue; }
    if (isbnKey) seenIsbn.set(isbnKey, row);
    if (serialKey) seenSerial.set(serialKey, row);

    if (!existing) {
      plan.create.push({
        row, copies: d.copies ?? 0, hidden: hidden ?? false, categoryIds: rowCats.map((c) => c.id!),
        data: Object.fromEntries(BOOK_FIELDS.map((f) => [f, d[f] ?? null])) as Record<BookField, unknown>,
      });
      continue;
    }

    matched.add(existing.id);
    const changes: PlannedUpdate["changes"] = [];
    const data: PlannedUpdate["data"] = {};
    for (const f of BOOK_FIELDS) {
      const next = d[f];
      // Blank or missing cell = keep the current value (old records often have gaps).
      if (next === undefined || next === null) continue;
      if (key(String(next)) !== key(existing[f] == null ? "" : String(existing[f]))) {
        data[f] = next;
        changes.push({ field: LABEL[f]!, from: show(existing[f]), to: show(next) });
      }
    }
    let categoryIds: string[] | undefined;
    if (rowCats.length) {
      const keep = existing.categories.filter((c) => !rowCats.some((r) => r.kind === c.kind));
      const nextIds = [...keep.map((c) => c.id), ...rowCats.map((c) => c.id!)];
      if (nextIds.slice().sort().join() !== existing.categories.map((c) => c.id).sort().join()) {
        categoryIds = nextIds;
        const name = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
        for (const rc of rowCats) {
          const old = existing.categories.find((c) => c.kind === rc.kind);
          if (old?.id !== rc.id) changes.push({ field: rc.kind === "SUBJECT" ? "Subject" : rc.kind === "WATTPAD" ? "Wattpad" : "Genre", from: show(old && name(old.id)), to: name(rc.id!) });
        }
      }
    }
    // Copies are only ever added, never removed (a copy may be on loan or have history).
    const addCopies = d.copies !== undefined && d.copies > existing._count.copies ? d.copies - existing._count.copies : 0;
    if (addCopies) changes.push({ field: "Copies", from: String(existing._count.copies), to: String(d.copies) });
    // A hidden book that is in the file is shown again, unless the file says Hidden = Yes.
    const nextHidden = hidden ?? false;
    const isHidden = nextHidden !== existing.isHidden ? nextHidden : undefined;
    if (isHidden !== undefined) changes.push({ field: "Hidden", from: existing.isHidden ? "Yes" : "No", to: nextHidden ? "Yes" : "No" });

    if (changes.length) plan.update.push({ row, id: existing.id, title: existing.title, changes, data, ...(categoryIds ? { categoryIds } : {}), addCopies, ...(isHidden !== undefined ? { isHidden } : {}) });
    else plan.unchanged++;
  }

  plan.hide = books.filter((b) => !b.isHidden && !matched.has(b.id)).map((b) => ({ id: b.id, title: b.title, authors: b.authors, isbn: b.isbn }));
  return plan;
}

/** Next free "<serial or ISBN>-NN" copy codes, the same pattern as Add Book / Add Copy. */
async function copyCodes(tx: Prisma.TransactionClient, book: { id: string; serialNumber: string | null; isbn: string | null }, start: number, count: number) {
  const prefix = book.serialNumber ?? book.isbn ?? `BK-${book.id.slice(-6).toUpperCase()}`;
  const codes: string[] = [];
  for (let n = start + 1; codes.length < count; n++) {
    const code = `${prefix}-${String(n).padStart(2, "0")}`;
    if (!(await tx.bookCopy.findUnique({ where: { barcode: code }, select: { id: true } }))) codes.push(code);
  }
  return codes;
}

/** Applies a plan inside the caller's transaction. Rows with errors are skipped. */
export async function applyPlan(tx: Prisma.TransactionClient, plan: ImportPlan, hideMissing: boolean) {
  for (const c of plan.create) {
    const book = await tx.book.create({
      data: { ...(c.data as Prisma.BookCreateInput), title: String(c.data.title), isHidden: c.hidden, categories: c.categoryIds.length ? { connect: c.categoryIds.map((id) => ({ id })) } : undefined } as Prisma.BookCreateInput,
      select: { id: true, serialNumber: true, isbn: true },
    });
    if (c.copies) await tx.bookCopy.createMany({ data: (await copyCodes(tx, book, 0, c.copies)).map((barcode) => ({ bookId: book.id, barcode })) });
  }
  for (const u of plan.update) {
    const book = await tx.book.update({
      where: { id: u.id },
      data: { ...(u.data as Prisma.BookUpdateInput), ...(u.isHidden !== undefined ? { isHidden: u.isHidden } : {}), ...(u.categoryIds ? { categories: { set: u.categoryIds.map((id) => ({ id })) } } : {}) },
      select: { id: true, serialNumber: true, isbn: true, _count: { select: { copies: true } } },
    });
    if (u.addCopies) await tx.bookCopy.createMany({ data: (await copyCodes(tx, book, book._count.copies, u.addCopies)).map((barcode) => ({ bookId: book.id, barcode })) });
  }
  if (hideMissing && plan.hide.length) await tx.book.updateMany({ where: { id: { in: plan.hide.map((b) => b.id) } }, data: { isHidden: true } });
  return { created: plan.create.length, updated: plan.update.length, hidden: hideMissing ? plan.hide.length : 0, skipped: plan.errors.length };
}

// --- preview tokens: the parsed rows wait here until the librarian clicks Apply ---
// shortcut: kept in this server's memory (lost on restart, one API instance only); move to Redis if the API is ever scaled out.
const pending = new Map<string, { userId: string; rows: ImportRow[]; expires: number }>();
export const PREVIEW_TTL_MS = 15 * 60_000;
export function savePreview(userId: string, rows: ImportRow[]) {
  const now = Date.now();
  for (const [k, p] of pending) if (p.expires < now) pending.delete(k);
  const token = randomBytes(18).toString("base64url");
  pending.set(token, { userId, rows, expires: now + PREVIEW_TTL_MS });
  return token;
}
export function takePreview(token: string, userId: string) {
  const p = pending.get(token);
  if (!p || p.expires < Date.now() || p.userId !== userId) return null;
  pending.delete(token);
  return p.rows;
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
function sheet(wb: ExcelJS.Workbook, name: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.field, width: ["title", "description"].includes(c.field) ? 40 : c.field === "authors" || c.field === "publisher" ? 28 : 14 }));
  ws.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = HEADER_FILL; });
  // ISBN / serial stay text, so Excel does not turn 9780306406157 into 9.78E+12.
  ws.getColumn("isbn").numFmt = "@";
  ws.getColumn("serialNumber").numFmt = "@";
  return ws;
}

export async function templateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = sheet(wb, "Books");
  ws.addRow({ title: "Noli Me Tangere", authors: "Jose Rizal", isbn: "9789710810736", serialNumber: "NMT-001", publisher: "Sample Publisher", publishedYear: 1887, bookType: "Other", gradeLevel: "Grade 9", subject: "", wattpad: "", genre: "", description: "Sample row: replace or delete it.", copies: 2, hidden: "No" });
  const help = wb.addWorksheet("How to fill");
  help.columns = [{ header: "Column", width: 14 }, { header: "What to put", width: 90 }];
  help.getRow(1).font = { bold: true };
  [
    ["Title", "Required."],
    ["Author / ISBN / Serial No.", "Used to find a book that is already in AklatOne (ISBN first, then Serial No., then Title + Author)."],
    ["Subject / Wattpad / Genre", "Must match a category name in AklatOne (Catalog > Categories). Leave blank if none."],
    ["Copies", "For a new book: how many copies to register. For an existing book: copies are added up to this number, never removed."],
    ["Hidden", "Yes = members cannot see the book. Blank or No = visible."],
    ["Blank cells", "For a book already in AklatOne, a blank cell keeps the current value."],
    ["Other columns", "Ignored. The import never adds new fields to AklatOne."],
  ].forEach((r) => help.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function exportWorkbook(db: Db): Promise<Buffer> {
  const books = await db.book.findMany({ orderBy: { title: "asc" }, include: { categories: true, _count: { select: { copies: true } } } });
  const wb = new ExcelJS.Workbook();
  const ws = sheet(wb, "Books");
  for (const b of books) {
    const cat = (k: string) => b.categories.find((c) => c.kind === k)?.name ?? "";
    ws.addRow({ title: b.title, authors: b.authors ?? "", isbn: b.isbn ?? "", serialNumber: b.serialNumber ?? "", publisher: b.publisher ?? "", publishedYear: b.publishedYear ?? "", bookType: b.bookType ?? "", gradeLevel: b.gradeLevel ?? "", subject: cat("SUBJECT"), wattpad: cat("WATTPAD"), genre: cat("GENRE"), description: b.description ?? "", copies: b._count.copies, hidden: b.isHidden ? "Yes" : "No" });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
