import ExcelJS from "exceljs";
import { prisma } from "../../config/prisma.js";

const ph = (d: Date | null | undefined, time = true) =>
  d ? new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) }).format(d) : "";
const OUTCOME: Record<string, string> = { RETURNED_ON_TIME: "Returned on time", RETURNED_LATE: "Returned late", DAMAGED: "Returned damaged", MISSING: "Missing" };
const HEADER: Partial<ExcelJS.Style> = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } } };

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols;
  ws.getRow(1).eachCell((c) => Object.assign(c, { style: HEADER }));
  return ws;
}

/** Reports as an Excel workbook for the date range (loans borrowed between from and to). */
export async function reportsWorkbook(from?: Date, to?: Date): Promise<Buffer> {
  const range = from || to ? { borrowedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  const now = new Date();
  const [loans, copies, overdue] = await Promise.all([
    prisma.borrowingTransaction.findMany({
      where: range,
      orderBy: { borrowedAt: "asc" },
      include: { bookCopy: { select: { barcode: true, book: { select: { title: true, isbn: true } } } }, borrower: { select: { username: true, displayName: true, memberType: true, gradeSection: true } } },
    }),
    prisma.bookCopy.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.borrowingTransaction.findMany({
      where: { status: "ACTIVE", dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      include: { bookCopy: { select: { barcode: true, book: { select: { title: true, isbn: true } } } }, borrower: { select: { username: true, displayName: true, gradeSection: true } } },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "AklatOne";
  const sum = sheet(wb, "Summary", [{ header: "Item", key: "k", width: 34 }, { header: "Value", key: "v", width: 40 }]);
  const popular = new Map<string, number>();
  for (const l of loans) popular.set(l.bookCopy.book.title, (popular.get(l.bookCopy.book.title) ?? 0) + 1);
  [
    ["School", "Tagumpay National High School (School ID 308114)"],
    ["Date range", from || to ? `${ph(from, false) || "start"} to ${ph(to, false) || "today"}` : "All dates"],
    ["Generated", ph(now)],
    ["Books lent in range", loans.length],
    ["Still borrowed (from range)", loans.filter((l) => l.status === "ACTIVE").length],
    ["Returned (from range)", loans.filter((l) => l.status === "RETURNED").length],
    ["Overdue now (all dates)", overdue.length],
    ["Different titles borrowed", popular.size],
  ].forEach(([k, v]) => sum.addRow({ k, v }));

  const L = sheet(wb, "Borrowed books", [
    { header: "Receipt no.", key: "receipt", width: 22 }, { header: "Title", key: "title", width: 40 }, { header: "ISBN", key: "isbn", width: 16 },
    { header: "Copy", key: "copy", width: 18 }, { header: "Borrower", key: "borrower", width: 28 }, { header: "Role", key: "role", width: 10 },
    { header: "Grade / Section", key: "grade", width: 16 }, { header: "Borrowed", key: "borrowed", width: 20 }, { header: "Due", key: "due", width: 14 },
    { header: "Returned", key: "returned", width: 20 }, { header: "Status", key: "status", width: 18 },
  ]);
  for (const l of loans) {
    L.addRow({
      receipt: l.receiptNo ?? "", title: l.bookCopy.book.title, isbn: l.bookCopy.book.isbn ?? "", copy: l.bookCopy.barcode,
      borrower: l.borrower.displayName || l.borrower.username, role: l.borrower.memberType ?? "", grade: l.borrower.gradeSection ?? "",
      borrowed: ph(l.borrowedAt), due: ph(l.dueAt, false), returned: ph(l.returnedAt),
      status: l.outcome ? OUTCOME[l.outcome] ?? l.outcome : l.status === "ACTIVE" ? (l.dueAt && l.dueAt < now ? "Overdue" : "Borrowed") : l.status,
    });
  }

  const P = sheet(wb, "Popular books", [{ header: "Rank", key: "rank", width: 8 }, { header: "Title", key: "title", width: 48 }, { header: "Times borrowed", key: "count", width: 16 }]);
  [...popular.entries()].sort((a, b) => b[1] - a[1]).forEach(([title, count], i) => P.addRow({ rank: i + 1, title, count }));

  const C = sheet(wb, "Copies by status", [{ header: "Status", key: "status", width: 18 }, { header: "Copies", key: "count", width: 12 }]);
  copies.forEach((c) => C.addRow({ status: c.status, count: c._count._all }));

  const O = sheet(wb, "Overdue", [
    { header: "Title", key: "title", width: 40 }, { header: "Copy", key: "copy", width: 18 }, { header: "Borrower", key: "borrower", width: 28 },
    { header: "Grade / Section", key: "grade", width: 16 }, { header: "Due", key: "due", width: 14 }, { header: "Days overdue", key: "days", width: 14 },
  ]);
  for (const t of overdue) {
    O.addRow({ title: t.bookCopy.book.title, copy: t.bookCopy.barcode, borrower: t.borrower.displayName || t.borrower.username, grade: t.borrower.gradeSection ?? "", due: ph(t.dueAt, false), days: Math.floor((now.getTime() - t.dueAt!.getTime()) / 86_400_000) });
  }
  // Visitor's Log in the same dates (Member ID, not names, as on the kiosk).
  const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(d);
  const visits = await prisma.libraryVisit.findMany({
    where: from || to ? { day: { ...(from ? { gte: day(from) } : {}), ...(to ? { lte: day(to) } : {}) } } : {},
    orderBy: { timeIn: "asc" },
    select: { day: true, timeIn: true, timeOut: true, source: true, member: { select: { maskedId: true, memberType: true, gradeSection: true, department: true } } },
  });
  const V = sheet(wb, "Library visits", [
    { header: "Member ID", key: "id", width: 14 }, { header: "Role", key: "role", width: 10 }, { header: "Grade / Section or Department", key: "group", width: 28 },
    { header: "Date", key: "day", width: 12 }, { header: "Time In", key: "in", width: 20 }, { header: "Time Out", key: "out", width: 20 }, { header: "Minutes", key: "min", width: 10 }, { header: "Recorded by", key: "src", width: 12 },
  ]);
  for (const v of visits) {
    V.addRow({
      id: v.member.maskedId ?? "", role: v.member.memberType ?? "", group: (v.member.memberType === "Teacher" ? v.member.department : v.member.gradeSection) ?? "",
      day: v.day, in: ph(v.timeIn), out: v.timeOut ? ph(v.timeOut) : "no Time Out", min: v.timeOut ? Math.round((v.timeOut.getTime() - v.timeIn.getTime()) / 60000) : "",
      src: v.source === "phone" ? "App" : "Kiosk",
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
