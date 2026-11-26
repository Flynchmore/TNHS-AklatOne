import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { phDateTime } from "../../lib/dates";

/** Paper sizes the school uses (mm). "Long" = 8.5 x 13 in long bond paper, common in Philippine schools. */
export const PAPERS = {
  a4: { label: "A4 (210 × 297 mm)", w: 210, h: 297 },
  letter: { label: "Letter / Short (8.5 × 11 in)", w: 215.9, h: 279.4 },
  long: { label: "Long / Folio (8.5 × 13 in)", w: 215.9, h: 330.2 },
  legal: { label: "Legal (8.5 × 14 in)", w: 215.9, h: 355.6 },
  a5: { label: "A5 (148 × 210 mm)", w: 148, h: 210 },
} as const;
export type PaperKey = keyof typeof PAPERS;
export type Orientation = "portrait" | "landscape";
export interface Size { w: number; h: number }
export const MARGIN = 12;          // mm around the content of every page
const PAGE_FOOT = 8;               // mm for "Generated … · Page n of N"
const MM = 96 / 25.4;              // CSS pixels per millimetre

export const paperSize = (key: PaperKey, o: Orientation): Size => (o === "landscape" ? { w: PAPERS[key].h, h: PAPERS[key].w } : { w: PAPERS[key].w, h: PAPERS[key].h });

/** Tells the printer the chosen paper (the browser's print dialog then starts on that size, with no extra margin). */
export function usePageRule(size: Size | null) {
  useEffect(() => {
    if (!size) return;
    const el = document.createElement("style");
    el.dataset.akPage = "";
    el.textContent = `@media print { @page { size: ${size.w}mm ${size.h}mm; margin: 0; } }`;
    document.head.appendChild(el);
    return () => el.remove();
  }, [size?.w, size?.h, size]);
}

/** Saved choice of paper per list on this computer. */
export function usePaper(key: string, fallback: PaperKey = "a4"): [PaperKey, Orientation, (p: PaperKey) => void, (o: Orientation) => void] {
  const read = <T,>(k: string, d: T): T => { try { return (localStorage.getItem(k) as T | null) ?? d; } catch { return d; } };
  const [paper, setPaper] = useState<PaperKey>(() => read(`aklatone_paper:${key}`, fallback));
  const [orient, setOrient] = useState<Orientation>(() => read(`aklatone_orient:${key}`, "portrait"));
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  return [paper in PAPERS ? paper : fallback, orient, p => { setPaper(p); save(`aklatone_paper:${key}`, p); }, o => { setOrient(o); save(`aklatone_orient:${key}`, o); }];
}

/** School letterhead on every printed list (DepEd seal left, TNHS seal right). Fixed height so pages can be planned. */
export function DocHeader({ title }: { title: string }) {
  return (
    <div className="text-black" style={{ height: "38mm" }}>
      <header className="flex items-center gap-[4mm] border-b-2 border-[#1E326D] pb-[2mm]" style={{ height: "28mm" }}>
        <img src="/deped-logo.png" alt="Department of Education seal" style={{ width: "22mm", height: "22mm" }} className="object-contain shrink-0" />
        <div className="flex-1 text-center leading-[1.2]">
          <p className="text-[8.5pt] font-semibold uppercase tracking-wide">Republic of the Philippines</p>
          <p className="text-[10pt] font-bold uppercase">Department of Education</p>
          <p className="text-[8.5pt] font-semibold uppercase">Region IV-A CALABARZON</p>
          <p className="text-[12.5pt] font-extrabold uppercase text-[#1E326D]">Tagumpay National High School</p>
          <p className="text-[8.5pt]">Tagumpay St., San Jose, Rodriguez, Rizal 1860</p>
        </div>
        <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" style={{ width: "22mm", height: "22mm" }} className="object-contain shrink-0" />
      </header>
      <h2 className="text-center text-[12pt] font-extrabold uppercase tracking-wide text-[#1E326D]" style={{ marginTop: "3mm" }}>{title}</h2>
    </div>
  );
}

function PageFoot({ n, total, note }: { n: number; total: number; note?: string }) {
  return (
    <div className="mt-auto flex items-end justify-between text-[7.5pt] text-[#5B6578]" style={{ height: `${PAGE_FOOT}mm` }}>
      <span>AklatOne · Generated {phDateTime(Date.now())}{note ? ` · ${note}` : ""}</span>
      <span className="font-semibold">Page {n} of {total}</span>
    </div>
  );
}

/** One sheet of paper: exact size on screen and on paper; only the current page shows on screen, all of them print. */
function Sheet({ size, shown, children }: { size: Size; shown: boolean; children: ReactNode }) {
  return (
    <section className={`ak-sheet-page ak-paper bg-white text-black flex-col mx-auto shadow-xl ring-1 ring-black/5 ${shown ? "flex" : "hidden"} print:flex`}
      style={{ width: `${size.w}mm`, height: `${size.h}mm`, padding: `${MARGIN}mm` }}>
      {children}
    </section>
  );
}

/** Previous / next page and "Page n of N" for the preview. */
export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= 1) return <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted"><FileText size={16} aria-hidden="true" />1 page</span>;
  const b = "w-10 h-10 rounded-xl border border-line-strong bg-surface flex items-center justify-center text-ink disabled:opacity-40 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label="Pages">
      <button type="button" className={b} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft size={18} aria-hidden="true" /></button>
      <label className="text-sm text-ink flex items-center gap-1.5">Page
        <select value={page} onChange={e => onPage(Number(e.target.value))} className="min-h-10 rounded-xl border border-line-strong bg-surface px-2 text-ink">
          {Array.from({ length: total }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
        </select>
        of {total}
      </label>
      <button type="button" className={b} onClick={() => onPage(page + 1)} disabled={page >= total - 1} aria-label="Next page"><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  );
}

type Plan = { rows: number[]; head: boolean; foot: boolean }[];

/**
 * Packs measured row heights into pages: letterhead on page 1, column headings on every page, signatures on the last
 * page (or a page of their own when they do not fit). Pure, so it is unit-tested.
 */
export function planPages(cap: number, headH: number, theadH: number, rowH: number[], footH: number): Plan {
  const pages: Plan = [];
  let cur: number[] = [], used = headH + theadH, first = true;
  rowH.forEach((h, i) => {
    if (cur.length && used + h > cap) { pages.push({ rows: cur, head: first, foot: false }); first = false; cur = []; used = theadH; }
    cur.push(i); used += h;
  });
  if (used + footH > cap && cur.length) { pages.push({ rows: cur, head: first, foot: false }); pages.push({ rows: [], head: false, foot: true }); }
  else pages.push({ rows: cur, head: first, foot: true });
  return pages;
}

/** A printed list (table) cut into real pages for the chosen paper. Row heights are measured, so long titles still fit. */
export function PagedTable({ size, title, columns, rows, footer, page, onPages, note }: {
  size: Size; title: string; columns: string[]; rows: (string | number)[][]; footer?: ReactNode; page: number; onPages: (n: number) => void; note?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<Plan>([{ rows: rows.map((_, i) => i), head: true, foot: true }]);
  // Column widths come from the full list, and every page uses the same ones, so a row is as tall on its page as it was
  // when measured (a page with only short titles would otherwise get other widths and other heights).
  const [cols, setCols] = useState<number[]>([]);
  const contentW = size.w - 2 * MARGIN;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = (sel: string) => (el.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
    const rowH = [...el.querySelectorAll("tbody tr")].map(r => r.getBoundingClientRect().height);
    const ths = [...el.querySelectorAll("thead th")].map(th => th.getBoundingClientRect().width);
    const total = ths.reduce((a, b) => a + b, 0) || 1;
    setCols(ths.map(w => (w / total) * 100));
    const cap = (size.h - 2 * MARGIN - PAGE_FOOT) * MM;
    const p = planPages(cap, h("[data-m=head]"), h("thead"), rowH, h("[data-m=foot]"));
    setPlan(p);
    onPages(p.length);
  }, [rows, size.w, size.h, title, onPages, footer]);

  const table = (idx: number[], fixed = true) => (
    <table className="w-full text-[9pt] border-collapse" style={fixed && cols.length ? { tableLayout: "fixed" } : undefined}>
      {fixed && cols.length > 0 && <colgroup>{cols.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>}
      <thead><tr>{columns.map(c => <th key={c} className="text-left text-[8pt] font-bold uppercase text-[#1E326D] border-b-2 border-[#7B88A1] px-[1.5mm] py-[1.5mm]">{c}</th>)}</tr></thead>
      <tbody>{idx.map(i => <tr key={i} className="border-b border-[#DCE3F0]">{rows[i]!.map((v, j) => <td key={j} className={`px-[1.5mm] py-[1.2mm] align-top break-words ${/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(String(v)) ? "whitespace-nowrap" : ""}`}>{v}</td>)}</tr>)}</tbody>
    </table>
  );
  return (
    <>
      {/* Invisible copy at the paper's width, used only to measure heights. */}
      <div ref={box} aria-hidden="true" className="ak-paper ak-no-print fixed -left-[9999px] top-0 bg-white text-black" style={{ width: `${contentW}mm` }}>
        <div data-m="head"><DocHeader title={title} /></div>
        {table(rows.map((_, i) => i), false)}
        {footer && <div data-m="foot">{footer}</div>}
      </div>
      {plan.map((p, n) => (
        <Sheet key={n} size={size} shown={n === page}>
          {p.head && <DocHeader title={title} />}
          {p.rows.length > 0 && table(p.rows)}
          {!rows.length && n === 0 && <p className="text-center text-[#5B6578] py-10">Nothing to print in this list.</p>}
          {p.foot && footer}
          <PageFoot n={n + 1} total={plan.length} note={note} />
        </Sheet>
      ))}
    </>
  );
}

/** How many fixed-size items (ID cards, QR labels) fit on one page of this paper. Pure, so it is unit-tested. */
export function gridFit(size: Size, itemW: number, itemH: number, gap: number, headerH = 0) {
  const w = size.w - 2 * MARGIN, h = size.h - 2 * MARGIN - PAGE_FOOT - headerH;
  const cols = Math.max(1, Math.floor((w + gap) / (itemW + gap))), rowsN = Math.max(1, Math.floor((h + gap) / (itemH + gap)));
  return { cols, rows: rowsN, perPage: cols * rowsN };
}

/** Fixed-size items laid out page by page (cut lines are drawn by each item). */
export function PagedGrid<T>({ size, items, itemW, itemH, gap, render, title, page, onPages, note }: {
  size: Size; items: T[]; itemW: number; itemH: number; gap: number; render: (item: T) => ReactNode; title?: string; page: number; onPages: (n: number) => void; note?: string;
}) {
  const fit = gridFit(size, itemW, itemH, gap, (title ? 38 : 0) + 3);
  const pages = Math.max(1, Math.ceil(items.length / fit.perPage));
  useEffect(() => { onPages(pages); }, [pages, onPages]);
  return (
    <>
      {Array.from({ length: pages }, (_, n) => (
        <Sheet key={n} size={size} shown={n === page}>
          {title && <DocHeader title={title} />}
          <div className="grid justify-center content-start" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${itemW}mm)`, gap: `${gap}mm`, paddingTop: "3mm" }}>
            {items.slice(n * fit.perPage, (n + 1) * fit.perPage).map((it, i) => <div key={i}>{render(it)}</div>)}
          </div>
          <PageFoot n={n + 1} total={pages} note={note ?? `${fit.perPage} per page`} />
        </Sheet>
      ))}
    </>
  );
}

/** A single designed page (Mobile app poster). */
export function SinglePage({ size, title, children, onPages }: { size: Size; title: string; children: ReactNode; onPages: (n: number) => void }) {
  useEffect(() => { onPages(1); }, [onPages]);
  return <Sheet size={size} shown><DocHeader title={title} />{children}<PageFoot n={1} total={1} /></Sheet>;
}
