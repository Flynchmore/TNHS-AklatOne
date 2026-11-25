import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Library, Copy, BookOpen, CheckCircle2, BookUp, AlertTriangle, Archive, BookPlus, Tags, FileText, Info, FileSpreadsheet, FileDown, EyeOff, Eye, ClipboardCheck } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Stars } from "../../components/Stars";
import { RefreshButton } from "../circulation/RefreshButton";
import { Badge, EmptyState, FormSection, PageHeader, Skeleton, StaffDialog, btn, btnSm, card, input, label, table, select } from "../../components/staff/ui";
import { CopiesDialog } from "./CopiesDialog";
import { BookCover } from "../../components/mobile/ui";
import { queuedToast, useOnline } from "../../lib/offline";
import { ImportDialog } from "./ImportDialog";
import { downloadXlsx } from "../../lib/download";

export interface Book {
  id: string; title: string; authors?: string | null; publisher?: string | null; publishedYear?: number | null;
  isbn?: string | null; coverUrl?: string | null; serialNumber?: string | null; description?: string | null;
  availability: { total: number; available: number }; rating: { average: number; count: number }; borrowCount?: number; viewCount?: number;
  categories?: Category[];
  isHidden?: boolean;
  updatedAt?: string;
}
interface Category { id: string; name: string; kind: Kind }
type Kind = "SUBJECT" | "WATTPAD" | "GENRE";
const KINDS: { kind: Kind; label: string }[] = [{ kind: "SUBJECT", label: "Subject" }, { kind: "WATTPAD", label: "Wattpad" }, { kind: "GENRE", label: "Genre" }];
const noCats: Record<Kind, string> = { SUBJECT: "", WATTPAD: "", GENRE: "" };
type FormState = { title: string; authors: string; publisher: string; publishedYear: string; isbn: string; serialNumber: string; copies: string; description: string };
const empty: FormState = { title: "", authors: "", publisher: "", publishedYear: "", isbn: "", serialNumber: "", copies: "1", description: "" };
const PAGE = 20;
const STATUS_TILE: Record<string, { icon: typeof Copy; cls: string; label: string }> = {
  AVAILABLE: { icon: CheckCircle2, cls: "bg-success-soft text-success", label: "Available" },
  BORROWED: { icon: BookUp, cls: "bg-primary-soft text-primary", label: "Borrowed" },
  LOST: { icon: AlertTriangle, cls: "bg-danger-soft text-danger", label: "Lost" },
  DAMAGED: { icon: AlertTriangle, cls: "bg-warning-soft text-warning", label: "Damaged" },
  RETIRED: { icon: Archive, cls: "bg-slate-100 text-ink-muted", label: "Retired" },
};

/** Staff Web/Desktop "Catalog": books (what members see in the mobile Catalog) and their physical copies in one place. */
export function Catalog() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canWrite = hasPerm("catalog:write");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Book | "new" | null>(null);
  const [copiesOf, setCopiesOf] = useState<Book | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const online = useOnline();

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  // Dashboard "Add a book" links here with ?new=1.
  // ?title= comes from lending at the desk when the book is not in AklatOne yet.
  const [newTitle, setNewTitle] = useState("");
  useEffect(() => { if (params.get("new") === "1" && canWrite) { setNewTitle(params.get("title") ?? ""); setEditing("new"); setParams({}, { replace: true }); } }, [params, setParams, canWrite]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["catalog", search, page, hiddenOnly],
    queryFn: async () => {
      const r = await apiFetch(`/api/v1/catalog?q=${encodeURIComponent(search)}&limit=${PAGE}&offset=${page * PAGE}${hiddenOnly ? "&hidden=1" : ""}`, { token });
      if (!r.ok) throw new Error(r.message);
      return r.data as { items: Book[]; total: number };
    },
    enabled: !!token,
  });
  const copies = useQuery({
    queryKey: ["copies-summary"],
    queryFn: async () => ((await apiFetch("/api/v1/book-copies/summary", { token })).data as { total: number; byStatus: { status: string; count: number }[] }),
    enabled: !!token && hasPerm("copies:read"),
  });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  const remove = useMutation({
    mutationFn: async (b: Book) => { const r = await apiFetch(`/api/v1/catalog/${b.id}`, { method: "DELETE", token }); if (!r.ok) throw new Error(r.message ?? "Delete failed"); return b; },
    onSuccess: (b) => { toast({ tone: "success", title: "Book deleted", message: `"${b.title}" was removed from the catalog.` }); setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["catalog"] }); qc.invalidateQueries({ queryKey: ["copies-summary"] }); qc.invalidateQueries({ queryKey: ["summary"] }); },
    onError: (e) => toast({ tone: "error", title: "Could not delete", message: (e as Error).message }),
  });
  const refreshAll = () => { qc.invalidateQueries({ queryKey: ["catalog"] }); qc.invalidateQueries({ queryKey: ["copies-summary"] }); qc.invalidateQueries({ queryKey: ["summary"] }); };

  const setHidden = async (b: Book, isHidden: boolean) => {
    const r = await apiFetch(`/api/v1/catalog/${b.id}`, { method: "PATCH", token, body: JSON.stringify({ isHidden }), ...(b.updatedAt ? { headers: { "X-Expected-Updated-At": b.updatedAt } } : {}), offline: { kind: "book", label: `${isHidden ? "Hide" : "Show"} book "${b.title}"` } });
    if (r.queued) { toast(queuedToast); return; }
    if (!r.ok) { toast({ tone: "error", title: "Not changed", message: r.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: isHidden ? "Book hidden" : "Book shown again", message: `"${b.title}" is ${isHidden ? "no longer" : "now"} visible to members.` });
    refreshAll();
  };
  const exportExcel = async () => {
    try { await downloadXlsx(token, "/api/v1/catalog/export.xlsx", "aklatone-books.xlsx"); toast({ tone: "success", title: "Catalog exported", message: "The Excel file was downloaded." }); }
    catch (e) { toast({ tone: "error", title: "Export failed", message: (e as Error).message }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Library}
        title="Catalog"
        subtitle="Books and their physical copies. Details here are what members see in the mobile Catalog."
        actions={<>
          <RefreshButton what="books" onRefresh={async () => { const r = await refetch(); copies.refetch(); return { isError: r.isError, data: r.data?.items }; }} />
          {hasPerm("copies:read") && <Link to="/inventory" className={btn.secondary}><ClipboardCheck size={18} aria-hidden="true" />Inventory audit</Link>}
          {canWrite && <button type="button" onClick={exportExcel} disabled={!online} title={online ? undefined : "Needs a connection to the server"} className={btn.secondary}><FileDown size={18} aria-hidden="true" />Export Excel</button>}
          {canWrite && <button type="button" onClick={() => setImporting(true)} disabled={!online} title={online ? undefined : "Needs a connection to the server"} className={btn.secondary}><FileSpreadsheet size={18} aria-hidden="true" />Import Excel</button>}
          {canWrite && <button type="button" onClick={() => setEditing("new")} className={btn.success}><Plus size={18} aria-hidden="true" />Add book</button>}
        </>}
      />

      {copies.data?.byStatus && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className={`${card} p-4`}>
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><Copy size={14} aria-hidden="true" />All copies</p>
            <p className="text-2xl font-bold text-ink mt-1 tabular-nums">{copies.data.total}</p>
          </div>
          {Object.entries(STATUS_TILE).map(([status, t]) => (
            <div key={status} className={`${card} p-4`}>
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><span className={`w-6 h-6 rounded-lg flex items-center justify-center ${t.cls}`} aria-hidden="true"><t.icon size={13} /></span>{t.label}</p>
              <p className="text-2xl font-bold text-ink mt-1 tabular-nums">{copies.data.byStatus.find(s => s.status === status)?.count ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
      <div className="relative flex-1 min-w-[16rem] max-w-lg">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden="true" />
        <label htmlFor="books-search" className="sr-only">Search books</label>
        <input id="books-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, author, ISBN or serial number" className={`${input} pl-11 !rounded-full shadow-sm`} />
      </div>
      {canWrite && (
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
          <input type="checkbox" checked={hiddenOnly} onChange={e => { setHiddenOnly(e.target.checked); setPage(0); }} className="w-4 h-4 accent-primary" />
          <EyeOff size={16} className="text-ink-muted" aria-hidden="true" />Hidden books only
        </label>
      )}
      </div>

      {isLoading && <Skeleton rows={5} />}
      {isError && <p role="alert" className="text-danger">Could not load books. <button className="underline" onClick={() => refetch()}>Try again</button></p>}
      {data && data.items.length === 0 && <EmptyState icon={BookOpen} text={hiddenOnly ? "No hidden books." : search ? `No books match "${search}".` : "No books yet. Add the first one."} />}

      {data && data.items.length > 0 && (
        <div className={`${table.wrap}`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>{["Serial", "Title / Author", "Published", "ISBN", "Copies", "Borrowed", "Views", "Rating"].map(h => <th key={h} className={table.th}>{h}</th>)}<th className={`${table.th} text-right`}>Actions</th></tr>
            </thead>
            <tbody>
              {data.items.map(b => (
                <tr key={b.id} className={table.row}>
                  <td className={`${table.td} font-mono text-xs text-ink`}>{b.serialNumber ?? <span className="text-ink-muted font-sans italic">Not set</span>}</td>
                  <td className={table.td}><div className="flex items-center gap-3"><BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} className="w-10 h-14 rounded-lg shrink-0 shadow-sm" /><div className="min-w-0"><div className="font-semibold text-ink">{b.title} {b.isHidden && <Badge tone="warning"><EyeOff size={12} aria-hidden="true" />Hidden</Badge>}</div><div className="text-xs text-ink-muted">{b.authors || "Unknown author"}</div></div></div></td>
                  <td className={`${table.td} text-ink-muted`}>{[b.publishedYear, b.publisher].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={`${table.td} text-ink-muted font-mono text-xs`}>{b.isbn ?? "N/A"}</td>
                  <td className={table.td}><Badge tone={b.availability.available > 0 ? "success" : "danger"}>{b.availability.available} / {b.availability.total}</Badge></td>
                  <td className={`${table.td} text-ink`}>{b.borrowCount ?? 0}</td>
                  <td className={`${table.td} text-ink`}>{b.viewCount ?? 0}</td>
                  <td className={table.td}><Stars average={b.rating?.average ?? 0} count={b.rating?.count ?? 0} size={14} /></td>
                  <td className={table.td}>
                    {confirmDelete === b.id ? (
                      <div className="flex flex-wrap justify-end gap-2 ak-fade">
                        <button className={`${btn.danger} ${btnSm}`} disabled={remove.isPending} onClick={() => remove.mutate(b)}>Delete</button>
                        <button className={`${btn.ghost} ${btnSm}`} onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        {hasPerm("copies:read") && <button className={`${btn.secondary} ${btnSm}`} onClick={() => setCopiesOf(b)} aria-label={`Copies of ${b.title}`}><Copy size={14} aria-hidden="true" />Copies</button>}
                        {canWrite && b.isHidden && <button className={`${btn.secondary} ${btnSm}`} onClick={() => setHidden(b, false)} aria-label={`Show ${b.title} to members again`}><Eye size={14} aria-hidden="true" />Show</button>}
                        {canWrite && <button className={`${btn.secondary} ${btnSm}`} onClick={() => setEditing(b)} aria-label={`Edit ${b.title}`}><Pencil size={14} aria-hidden="true" />Edit</button>}
                        {canWrite && <button className={`${btn.secondary} ${btnSm} !text-danger hover:!border-danger hover:!bg-danger-soft`} onClick={() => setConfirmDelete(b.id)} aria-label={`Delete ${b.title}`}><Trash2 size={14} aria-hidden="true" /></button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          <button className={`${btn.secondary} ${btnSm}`} disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
          <span className="text-sm text-ink-muted">Page {page + 1} of {pages}</span>
          <button className={`${btn.secondary} ${btnSm}`} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
      )}

      <BookDialog book={editing} newTitle={newTitle} onClose={() => { setEditing(null); setNewTitle(""); }} onSaved={() => { qc.invalidateQueries({ queryKey: ["catalog"] }); qc.invalidateQueries({ queryKey: ["copies-summary"] }); qc.invalidateQueries({ queryKey: ["summary"] }); }} />
      <CopiesDialog book={copiesOf} onClose={() => setCopiesOf(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={refreshAll} />
    </div>
  );
}

function BookDialog({ book, onClose, onSaved, newTitle = "" }: { book: Book | "new" | null; onClose: () => void; onSaved: () => void; newTitle?: string }) {
  const { token } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<Record<Kind, string>>(noCats);
  const isNew = book === "new";
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => ((await apiFetch("/api/v1/categories?limit=100", { token })).data as { items: Category[] }).items,
    enabled: !!book,
  });

  useEffect(() => {
    if (!book) return;
    setError("");
    setForm(book === "new" ? { ...empty, title: newTitle.slice(0, 255) } : {
      title: book.title, authors: book.authors ?? "", publisher: book.publisher ?? "", publishedYear: book.publishedYear ? String(book.publishedYear) : "",
      isbn: book.isbn ?? "", serialNumber: book.serialNumber ?? "", copies: "0", description: book.description ?? "",
    });
    // One category per kind (the server enforces this too).
    setCats(book === "new" ? noCats : { ...noCats, ...Object.fromEntries((book.categories ?? []).map(c => [c.kind, c.id])) });
  }, [book, newTitle]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    const { copies, ...fields } = form;
    const categoryIds = Object.values(cats).filter(Boolean);
    const body = isNew ? { ...fields, copies: Number(copies) || 0, categoryIds } : { ...fields, categoryIds };
    // Edits carry the version they started from; the server refuses them if someone changed the book meanwhile.
    const expected = !isNew && (book as Book).updatedAt ? { "X-Expected-Updated-At": (book as Book).updatedAt! } : undefined;
    const r = await apiFetch(isNew ? "/api/v1/catalog" : `/api/v1/catalog/${(book as Book).id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body), token, ...(expected ? { headers: expected } : {}), offline: { kind: "book", label: `${isNew ? "Add" : "Edit"} book "${form.title.trim()}"` } });
    setSaving(false);
    if (r.queued) { toast(queuedToast); onClose(); return; }
    if (!r.ok) {
      const details = (r.data as { errors?: { fieldErrors?: Record<string, string[]> } } | null)?.errors?.fieldErrors;
      const msg = details ? Object.entries(details).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ") : r.message ?? "Could not save the book.";
      setError(msg);
      toast({ tone: "error", title: "Could not save", message: msg });
      return;
    }
    toast({ tone: "success", title: isNew ? "Book added" : "Book updated", message: `"${form.title.trim()}" is ${isNew ? "now in" : "updated in"} the mobile Catalog.` });
    onSaved();
    onClose();
  };

  const field = (text: string, k: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label htmlFor={`book-${k}`} className={label}>{text}</label>
      <input id={`book-${k}`} value={form[k]} onChange={set(k)} className={input} {...props} />
      {hint && <p className="text-xs text-ink-muted mt-1">{hint}</p>}
    </div>
  );

  return (
    <StaffDialog open={!!book} onClose={onClose} title={isNew ? "Add book" : "Edit book"} subtitle={isNew ? "New title for the mobile Catalog" : form.title || "Update the book details"} icon={isNew ? BookPlus : Pencil} wide onSubmit={save}
      footer={<>
        <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
        <button type="submit" disabled={saving} className={btn.primary}>{saving ? "Saving…" : isNew ? "Add book" : "Save changes"}</button>
      </>}
    >
      {error && <p role="alert" className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-2xl p-3">{error}</p>}
      <FormSection title="Book information" icon={Info}>
        {field("Title *", "title", { required: true, maxLength: 255 })}
        <div className="grid sm:grid-cols-2 gap-4">
          {field("Author", "authors", { maxLength: 255 })}
          {field("Publisher", "publisher", { maxLength: 255 })}
          {field("Published year", "publishedYear", { inputMode: "numeric", placeholder: "e.g. 1887" })}
          {field("ISBN", "isbn", { maxLength: 20 }, "Leave blank if none (shown as N/A).")}
          {field("Serial number", "serialNumber", { maxLength: 30, placeholder: "e.g. NMT-001", style: { textTransform: "uppercase" } }, "Library code. Letters, numbers and dashes.")}
          {isNew && field("Copies", "copies", { type: "number", min: 0, max: 50 }, "Copy codes are made automatically; staff see copies by ISBN.")}
        </div>
      </FormSection>
      <FormSection title="Categories" icon={Tags}>
        <div className="grid sm:grid-cols-3 gap-4">
          {KINDS.map(k => (
            <div key={k.kind}>
              <label htmlFor={`book-cat-${k.kind}`} className="block text-xs font-medium text-ink-muted mb-1">{k.label}</label>
              <select id={`book-cat-${k.kind}`} value={cats[k.kind]} onChange={e => setCats(c => ({ ...c, [k.kind]: e.target.value }))} className={select}>
                <option value="">None</option>
                {(categories.data ?? []).filter(c => c.kind === k.kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-muted">Shown to members as e.g. "Subject - English", "Wattpad - Teen Fiction", "Genre - Horror".</p>
      </FormSection>
      <FormSection title="Description" icon={FileText}>
        <div>
          <label htmlFor="book-description" className={label}>Short description</label>
          <textarea id="book-description" value={form.description} onChange={set("description")} maxLength={2000} rows={5} className={`${input} resize-y`} placeholder="What is this book about?" />
          <p className="text-xs text-ink-muted mt-1 text-right">{form.description.length}/2000</p>
        </div>
      </FormSection>
    </StaffDialog>
  );
}
