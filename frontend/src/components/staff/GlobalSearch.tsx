import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, BookOpen, CornerDownLeft, Search, Users, X, type LucideIcon } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../features/auth/auth";
import { matches } from "./ui";

type Kind = "page" | "book" | "member" | "loan";
interface Hit { kind: Kind; id: string; title: string; sub?: string; to: string; icon: LucideIcon }
export interface SearchPage { to: string; label: string; icon: LucideIcon; group: string }

const FILTERS: { key: "" | Kind; label: string }[] = [
  { key: "", label: "All" }, { key: "page", label: "Pages" }, { key: "book", label: "Books" }, { key: "member", label: "Members" }, { key: "loan", label: "Borrowed" },
];
const GROUP: Record<Kind, string> = { page: "Pages", book: "Books", member: "Members", loan: "Borrowed books" };

/**
 * Search the whole staff portal (Ctrl+K or the search button in the side nav): pages, books, members and borrowed
 * books in one box, with a filter for each kind. Opening a result goes to that page with the search already typed in.
 * Members are shown by Member ID and section, like the Members page (names are searchable but not shown).
 */
export function GlobalSearch({ pages, open, onClose }: { pages: SearchPage[]; open: boolean; onClose: () => void }) {
  const { token, hasPerm } = useAuth();
  const nav = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const canBooks = hasPerm("catalog:read"), canMembers = hasPerm("users:read"), canLoans = hasPerm("circulation:read");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal?.(); setQ(""); setHits([]); setKind(""); setActive(0); }
    if (!open && d.open) d.close();
  }, [open]);

  // Pages answer at once; books, members and borrowed books come from the server after a short pause in typing.
  useEffect(() => {
    if (!open) return;
    const text = q.trim();
    const pageHits: Hit[] = pages.filter(p => matches(text, p.label, p.group)).map(p => ({ kind: "page", id: p.to, title: p.label, sub: p.group, to: p.to, icon: p.icon }));
    if (text.length < 2) { setHits(text ? pageHits : pageHits.slice(0, 8)); setBusy(false); return; }
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const qs = encodeURIComponent(text);
      const [books, members, loans] = await Promise.all([
        canBooks ? apiFetch(`/api/v1/catalog?q=${qs}&limit=6`, { token }) : null,
        canMembers ? apiFetch(`/api/v1/users?q=${qs}&limit=6`, { token }) : null,
        canLoans ? apiFetch("/api/v1/circulation/transactions?status=ACTIVE&limit=100", { token }) : null,
      ]);
      if (!live) return;
      const list = <T,>(r: { ok: boolean; data?: unknown } | null) => (r?.ok ? ((r.data as { items?: T[] }).items ?? []) : []);
      type Book = { id: string; title: string; authors?: string | null; isbn?: string | null };
      type Member = { id: string; maskedId?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null };
      type Loan = { id: string; receiptNo?: string | null; dueAt?: string | null; bookCopy?: { barcode?: string; book?: { title: string; isbn?: string | null } }; borrower?: { username: string; displayName?: string | null } };
      setHits([
        ...pageHits,
        ...list<Book>(books).map(b => ({ kind: "book" as const, id: b.id, title: b.title, sub: [b.authors, b.isbn && `ISBN ${b.isbn}`].filter(Boolean).join(" · "), to: `/catalog?q=${encodeURIComponent(b.title)}`, icon: BookOpen })),
        ...list<Member>(members).map(m => ({ kind: "member" as const, id: m.id, title: m.maskedId || "No Member ID yet", sub: (m.memberType === "Teacher" ? m.department : m.gradeSection) || m.memberType || "", to: `/members?q=${encodeURIComponent(m.maskedId || text)}`, icon: Users })),
        ...list<Loan>(loans).filter(l => matches(text, l.bookCopy?.book?.title, l.bookCopy?.book?.isbn, l.bookCopy?.barcode, l.receiptNo, l.borrower?.displayName, l.borrower?.username)).slice(0, 6)
          .map(l => ({ kind: "loan" as const, id: l.id, title: l.bookCopy?.book?.title ?? "Borrowed book", sub: [l.receiptNo, l.bookCopy?.barcode].filter(Boolean).join(" · "), to: `/borrowing?tab=borrowed&q=${encodeURIComponent(l.receiptNo || l.bookCopy?.book?.title || text)}`, icon: ArrowLeftRight })),
      ]);
      setBusy(false);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, open, pages, token, canBooks, canMembers, canLoans]);

  const shown = hits.filter(h => !kind || h.kind === kind);
  const go = (h: Hit) => { onClose(); nav(h.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && shown[active]) { e.preventDefault(); go(shown[active]!); }
  };

  let lastGroup = "";
  return (
    <dialog ref={ref} onClose={onClose} aria-label="Search AklatOne" className="ak-no-print m-auto mt-[10vh] w-[calc(100%-2rem)] max-w-2xl rounded-3xl p-0 bg-surface text-ink shadow-2xl backdrop:bg-black/50 ak-scale">
      {open && (
        <div onKeyDown={onKey}>
          <div className="flex items-center gap-3 px-5 border-b border-line">
            <Search size={20} className="text-primary shrink-0" aria-hidden="true" />
            <label htmlFor="global-search" className="sr-only">Search pages, books, members and borrowed books</label>
            <input id="global-search" autoFocus type="search" value={q} onChange={e => { setQ(e.target.value); setActive(0); }} autoComplete="off"
              placeholder="Search pages, books, members, borrowed books…" className="flex-1 min-h-16 bg-transparent text-base outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"><X size={18} aria-hidden="true" /></button>}
            <kbd className="hidden sm:inline text-[11px] font-semibold text-ink-muted border border-line rounded-md px-1.5 py-0.5">Esc</kbd>
          </div>
          <div role="radiogroup" aria-label="Show only" className="flex flex-wrap gap-2 px-5 py-3 border-b border-line">
            {FILTERS.map(f => {
              const on = kind === f.key;
              const n = f.key ? hits.filter(h => h.kind === f.key).length : hits.length;
              return (
                <button key={f.key} type="button" role="radio" aria-checked={on} onClick={() => { setKind(f.key); setActive(0); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${on ? "bg-primary text-white border-primary" : "bg-surface text-ink border-line-strong hover:border-primary"}`}>
                  {f.label}{q.trim().length >= 2 && <span className={on ? "text-white/80" : "text-ink-muted"}> {n}</span>}
                </button>
              );
            })}
          </div>
          <ul role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2">
            {shown.map((h, i) => {
              const head = GROUP[h.kind] !== lastGroup ? (lastGroup = GROUP[h.kind]) : "";
              return (
                <li key={`${h.kind}-${h.id}`} role="option" aria-selected={i === active}>
                  {head && <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">{head}</p>}
                  <button type="button" onClick={() => go(h)} onMouseEnter={() => setActive(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left focus-visible:outline-none ${i === active ? "bg-primary-soft" : ""}`}>
                    <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><h.icon size={18} /></span>
                    <span className="min-w-0 flex-1"><span className={`block text-sm font-semibold text-ink truncate ${h.kind === "member" ? "font-mono" : ""}`}>{h.title}</span>{h.sub && <span className="block text-xs text-ink-muted truncate">{h.sub}</span>}</span>
                    {i === active && <CornerDownLeft size={16} className="text-primary shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-5 py-3 border-t border-line text-xs text-ink-muted" aria-live="polite">
            {busy ? "Searching…" : q.trim().length === 1 ? "Type at least 2 letters to search books, members and borrowed books." : q.trim() && !shown.length ? `Nothing found for “${q.trim()}”.` : "↑ ↓ to move, Enter to open. Open the page to use its filters."}
          </p>
        </div>
      )}
    </dialog>
  );
}
