import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { X, Send, Library, ChevronLeft, ChevronRight, ArrowUp, Star, BookCheck, Eye, SlidersHorizontal, BellRing, BellOff, MessageSquareText, QrCode } from "lucide-react";
import { Scanner } from "../../components/staff/Scanner";
import { BOOK_TYPES, GRADE_LEVELS } from "../../lib/bookFields";
import { Alert, BookCover, CategoryChips, CurvedPanel, FloatingSearch, ListState, PhotoHeader, Spinner, btnPrimary, focusRing, isNewBook, mobileApi, type CategoryLike } from "../../components/mobile/ui";
import { FavouriteButton } from "../../components/mobile/FavouriteButton";
import { useToast } from "../../components/Toast";
import { Stars, StarPicker } from "../../components/Stars";

interface Book {
  id: string; title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; serialNumber?: string | null;
  publisher?: string | null; publishedYear?: number | null; description?: string | null;
  availability?: { total: number; available: number };
  rating?: { average: number; count: number }; myRating?: number | null;
  borrowCount?: number; viewCount?: number; canRate?: boolean; createdAt?: string;
  categories?: CategoryLike[]; favourite?: boolean; watching?: boolean; bookType?: string | null; gradeLevel?: string | null;
  myReview?: { text: string; status: string | null } | null;
}
interface Review { id: string; stars: number; review: string; name: string; updatedAt: string }

/** Seconds a member must stay on a book before it counts as a view (the request asked for 10-15 s). */
export const VIEW_AFTER_MS = 12000;

const PAGE_SIZE = 10;
const smooth = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth") as ScrollBehavior;

/** "Available" / "All copies borrowed" / "Unavailable at the moment" (no copies on the shelf at all). */
export function availabilityText(a?: { total: number; available: number }) {
  if (!a || a.total === 0) return { text: "Unavailable at the moment", ok: false };
  if (a.available === 0) return { text: "All copies borrowed", ok: false };
  return { text: `Available · ${a.available} of ${a.total} copies`, ok: true };
}

/** Page numbers with ellipses, e.g. 1 … 4 5 6 … 12. */
export function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1].filter(n => n >= 1 && n <= total));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1]! > 1) out.push("…"); out.push(n); });
  return out;
}

interface Filters { categoryId: string; gradeLevel: string; bookType: string; available: boolean; sort: string }
const NO_FILTERS: Filters = { categoryId: "", gradeLevel: "", bookType: "", available: false, sort: "title:asc" };
const SORTS = [
  { value: "title:asc", label: "Title (A to Z)" },
  { value: "createdAt:desc", label: "Newest in the library" },
  { value: "publishedYear:desc", label: "Publication year (newest)" },
  { value: "authors:asc", label: "Author (A to Z)" },
];

export function MobileCatalog() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Book | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [showTop, setShowTop] = useState(false);
  const listTop = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<CategoryLike[]>([]);
  // Categories are only needed once the member opens Filters.
  useEffect(() => {
    if (!showFilters || categories.length) return;
    mobileApi("/api/v1/categories?limit=100", { token: auth.token }).then(r => { if (r.ok) setCategories(((r.data as { items?: CategoryLike[] } | null)?.items) ?? []); });
  }, [showFilters, categories.length, auth.token]);
  const activeFilters = Number(!!filters.categoryId) + Number(!!filters.gradeLevel) + Number(!!filters.bookType) + Number(filters.available) + Number(filters.sort !== NO_FILTERS.sort);
  const changeFilters = (f: Partial<Filters>) => { setFilters(cur => ({ ...cur, ...f })); setPage(1); };

  // Wait for typing to pause before searching; a new search starts at page 1.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback((q: string, p: number, signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError("");
    const [sortBy, sortOrder] = filters.sort.split(":");
    const extra = `${filters.categoryId ? `&categoryId=${filters.categoryId}` : ""}${filters.gradeLevel ? `&gradeLevel=${encodeURIComponent(filters.gradeLevel)}` : ""}${filters.bookType ? `&bookType=${encodeURIComponent(filters.bookType)}` : ""}${filters.available ? "&available=1" : ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    mobileApi(`/api/v1/catalog?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${(p - 1) * PAGE_SIZE}${extra}`, { token: auth.token }).then(r => {
      if (signal?.cancelled) return;
      if (r.ok) { const d = r.data as { items?: Book[]; total?: number } | null; setBooks(d?.items ?? []); setTotal(d?.total ?? 0); }
      else setError(r.message ?? "Failed to load the catalog.");
      setLoading(false);
    });
  }, [auth.token, filters]);

  useEffect(() => {
    const signal = { cancelled: false };
    load(debounced, page, signal);
    setParams(debounced ? { q: debounced } : {}, { replace: true });
    return () => { signal.cancelled = true; };
  }, [debounced, page, load, setParams]);

  // "Back to top" appears once the member has scrolled down the list.
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goTo = (p: number) => {
    setPage(Math.min(Math.max(1, p), pages));
    listTop.current?.scrollIntoView?.({ behavior: smooth(), block: "start" });
  };
  // Stable so the book sheet's 12-second view timer isn't restarted by unrelated re-renders (e.g. scrolling).
  // Scan the QR label of a book on the shelf: show its details and availability right away.
  const openScanned = async (code: string) => {
    setScanError("");
    const found = await mobileApi(`/api/v1/catalog/by-copy/${encodeURIComponent(code.trim())}`, { token: auth.token });
    if (!found.ok) return setScanError(found.status === 404 ? "No book has this QR code. Scan the AklatOne label on the book." : found.message ?? "Please try again.");
    const book = await mobileApi(`/api/v1/catalog/${(found.data as { bookId: string }).bookId}`, { token: auth.token });
    if (!book.ok) return setScanError(book.message ?? "Please try again.");
    setScanning(false);
    setSelected(book.data as Book);
  };
  const updateBook = useCallback((b: Book) => { setBooks(bs => bs.map(x => (x.id === b.id ? b : x))); setSelected(b); }, []);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <PhotoHeader>
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-on-primary" aria-hidden="true"><Library size={24} /></span>
          <div>
            <h1 className="text-2xl font-bold text-on-primary">Catalog</h1>
            <p className="text-sm text-white/90">Browse the school library collection</p>
          </div>
        </div>
        {!loading && !error && <p className="text-sm text-white/90 mt-3">{debounced ? `${total} result(s) for "${debounced}"` : activeFilters ? `${total} book(s) match the filters` : `${total} book(s) in the collection`}</p>}
      </PhotoHeader>

      <CurvedPanel label="Catalog">
        <FloatingSearch id="catalog-search" label="Search the catalog by title or author" placeholder="Find a book or author" value={query} onChange={setQuery} onSubmit={() => { setDebounced(query.trim()); setPage(1); }} buttonLabel="Search now" />

        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <button type="button" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters} aria-controls="catalog-filters" className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-surface border text-sm font-semibold ${activeFilters ? "border-primary text-primary" : "border-line-strong text-ink"} ${focusRing}`}>
            <SlidersHorizontal size={16} aria-hidden="true" />Filters{activeFilters > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center">{activeFilters}</span>}
          </button>
          <button type="button" onClick={() => { setScanning(v => !v); setScanError(""); }} aria-expanded={scanning} className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-primary-strong shadow-sm ${focusRing}`}>
            <QrCode size={16} aria-hidden="true" />Scan book QR
          </button>
          {activeFilters > 0 && <button type="button" onClick={() => changeFilters(NO_FILTERS)} className={`min-h-11 px-3 rounded-full text-sm font-semibold text-ink-muted underline ${focusRing}`}>Clear</button>}
        </div>
        {scanning && (
          <div className="bg-surface rounded-2xl border border-line shadow-sm p-4 space-y-3 ak-fade">
            <p className="text-sm text-ink-muted">Scan the AklatOne QR label on a book in the library to see its details and how many copies are on the shelf.</p>
            <Scanner id="m-shelf-scan" label="Book QR code" autoFocus={false} onCode={openScanned} />
            {scanError && <Alert>{scanError}</Alert>}
          </div>
        )}
        {showFilters && (
          <div id="catalog-filters" className="bg-surface rounded-2xl border border-line shadow-sm p-4 space-y-4 ak-fade">
            <div>
              <label htmlFor="flt-cat" className="block text-sm font-semibold text-ink mb-1">Category</label>
              <select id="flt-cat" value={filters.categoryId} onChange={e => changeFilters({ categoryId: e.target.value })} className={`ak-select w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-ink ${focusRing}`}>
                <option value="">All categories</option>
                {(["SUBJECT", "WATTPAD", "GENRE"] as const).map(k => {
                  const list = categories.filter(c => c.kind === k);
                  return list.length ? <optgroup key={k} label={k === "SUBJECT" ? "Subject" : k === "WATTPAD" ? "Wattpad" : "Genre"}>{list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null;
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="flt-grade" className="block text-sm font-semibold text-ink mb-1">Grade level</label>
                <select id="flt-grade" value={filters.gradeLevel} onChange={e => changeFilters({ gradeLevel: e.target.value })} className={`ak-select w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-ink ${focusRing}`}>
                  <option value="">All</option>{GRADE_LEVELS.filter(g => g !== "All grade levels").map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="flt-type" className="block text-sm font-semibold text-ink mb-1">Book type</label>
                <select id="flt-type" value={filters.bookType} onChange={e => changeFilters({ bookType: e.target.value })} className={`ak-select w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-ink ${focusRing}`}>
                  <option value="">All</option>{BOOK_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="flt-sort" className="block text-sm font-semibold text-ink mb-1">Sort by</label>
              <select id="flt-sort" value={filters.sort} onChange={e => changeFilters({ sort: e.target.value })} className={`ak-select w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-ink ${focusRing}`}>
                {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <label className="flex items-center justify-between gap-3 min-h-11 text-sm font-semibold text-ink">
              Available now only
              <input type="checkbox" checked={filters.available} onChange={e => changeFilters({ available: e.target.checked })} className="w-5 h-5 accent-primary" />
            </label>
          </div>
        )}

        <div ref={listTop} className="scroll-mt-24" />
        <ListState
          loading={loading && "Loading books…"}
          error={error}
          onRetry={() => load(debounced, page)}
          empty={books.length === 0 && (debounced ? <>No books match "{debounced}". <Link to={`/m/suggestions?title=${encodeURIComponent(debounced)}`} className="font-semibold text-primary underline">Suggest this book</Link> to the librarian.</> : "No books in the catalog yet.")}
        >
          <p className="sr-only" role="status">Page {page} of {pages}, {books.length} book(s) shown</p>
          <ul className="space-y-3">
            {books.map(b => {
              const av = availabilityText(b.availability);
              return (
                <li key={b.id} className="relative">
                  <button type="button" onClick={() => setSelected(b)} className={`w-full text-left bg-surface rounded-2xl border border-line shadow-sm p-4 pr-14 flex gap-3 hover:border-primary transition ${focusRing}`}>
                    <BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} isNew={isNewBook(b.createdAt)} className="w-16 h-24 rounded-lg shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-ink line-clamp-2">{b.title}</span>
                      <span className="block text-sm text-ink-muted line-clamp-1">{b.authors || "Unknown author"}</span>
                      <span className={`inline-block mt-1.5 text-xs font-medium px-3 py-1 leading-tight rounded-full ${av.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{av.ok ? `${b.availability!.available} of ${b.availability!.total} available` : av.text}</span>
                      <span className="flex items-center gap-3 mt-1.5 text-xs text-ink-muted">
                        <span className="inline-flex items-center gap-1" aria-label={b.rating?.count ? `Rated ${b.rating.average.toFixed(1)} out of 5` : "No ratings yet"}>
                          <Star size={13} className={b.rating?.count ? "text-amber-500 fill-amber-400" : "text-slate-400"} aria-hidden="true" />
                          <span aria-hidden="true">{b.rating?.count ? b.rating.average.toFixed(1) : "—"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" aria-label={`Borrowed ${b.borrowCount ?? 0} times`}>
                          <BookCheck size={13} aria-hidden="true" /><span aria-hidden="true">{b.borrowCount ?? 0}</span>
                        </span>
                      </span>
                      <CategoryChips categories={b.categories} className="mt-2" />
                    </span>
                  </button>
                  {auth.user?.role === "MEMBER" && (
                    <span className="absolute top-3 right-3">
                      <FavouriteButton bookId={b.id} title={b.title} favourite={!!b.favourite} available={b.availability?.available} watching={!!b.watching}
                        onChange={fav => setBooks(bs => bs.map(x => (x.id === b.id ? { ...x, favourite: fav } : x)))} onWatch={w => setBooks(bs => bs.map(x => (x.id === b.id ? { ...x, watching: w } : x)))} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <nav aria-label="Catalog pages" className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
              <button type="button" onClick={() => goTo(page - 1)} disabled={page === 1} aria-label="Previous page" className={`w-11 h-11 rounded-full bg-surface border border-line-strong flex items-center justify-center text-primary disabled:opacity-40 ${focusRing}`}><ChevronLeft size={18} aria-hidden="true" /></button>
              {pageList(page, pages).map((n, i) => n === "…"
                ? <span key={`gap-${i}`} className="w-6 text-center text-ink-muted" aria-hidden="true">…</span>
                : <button key={n} type="button" onClick={() => goTo(n)} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} className={`min-w-11 h-11 px-2 rounded-full text-sm font-semibold transition ${focusRing} ${n === page ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "bg-surface border border-line text-ink hover:border-primary"}`}>{n}</button>)}
              <button type="button" onClick={() => goTo(page + 1)} disabled={page === pages} aria-label="Next page" className={`w-11 h-11 rounded-full bg-surface border border-line-strong flex items-center justify-center text-primary disabled:opacity-40 ${focusRing}`}><ChevronRight size={18} aria-hidden="true" /></button>
            </nav>
          )}
        </ListState>
      </CurvedPanel>

      {/* Always mounted so it can fade/slide smoothly in and out; hidden from taps and screen readers when not shown. */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: smooth() })}
        aria-label="Back to top"
        aria-hidden={!showTop}
        tabIndex={showTop ? 0 : -1}
        className={`fixed right-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-30 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-lg flex items-center justify-center motion-safe:transition-all motion-safe:duration-300 ease-[cubic-bezier(.22,1,.36,1)] active:scale-90 ${focusRing} ${showTop ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-75 pointer-events-none"}`}
      >
        <ArrowUp size={22} aria-hidden="true" />
      </button>

      <BookSheet book={selected} onClose={() => setSelected(null)} onRequested={() => load(debounced, page)} onUpdated={updateBook} />
    </div>
  );
}

/** Scrollable book details with rating and "Request to borrow" (native modal dialog: focus trap and Escape come from the browser). */
function BookSheet({ book, onClose, onRequested, onUpdated }: { book: Book | null; onClose: () => void; onRequested: () => void; onUpdated: (b: Book) => void }) {
  const auth = useAuth();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const [sending, setSending] = useState(false);
  // Teacher emergency borrowing: no librarian in, the teacher (timed in today) takes the book and says so here.
  const [takenNow, setTakenNow] = useState(false);
  const teacher = auth.user?.memberType === "Teacher";
  const [rating, setRating] = useState(false);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [draft, setDraft] = useState("");
  const [watchBusy, setWatchBusy] = useState(false);
  const isMember = auth.user?.role === "MEMBER";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (book && !d.open) { setError(""); d.showModal?.(); }
    if (!book && d.open) d.close();
  }, [book]);

  // Approved reviews of this book, and the member's own review in the box.
  const reviewKey = book?.id;
  const myText = book?.myReview?.text ?? "";
  useEffect(() => { setDraft(myText); }, [reviewKey, myText]);
  useEffect(() => {
    if (!reviewKey || !auth.token) return;
    let live = true;
    setReviews([]);
    void mobileApi(`/api/v1/catalog/${reviewKey}/reviews`, { token: auth.token }).then(r => { if (live && r.ok) setReviews(r.data as Review[]); });
    return () => { live = false; };
  }, [reviewKey, auth.token]);

  // Count a view once the member has stayed on this book for VIEW_AFTER_MS (cancelled if they leave sooner).
  const bookId = book?.id;
  const latest = useRef(book);
  latest.current = book;
  useEffect(() => {
    if (!bookId || auth.user?.role !== "MEMBER") return;
    const t = setTimeout(async () => {
      const r = await mobileApi(`/api/v1/catalog/${bookId}/view`, { method: "POST", body: "{}", token: auth.token });
      const cur = latest.current;
      if (r.ok && cur?.id === bookId) onUpdated({ ...cur, viewCount: (r.data as { viewCount: number }).viewCount });
    }, VIEW_AFTER_MS);
    return () => clearTimeout(t);
  }, [bookId, auth.token, auth.user?.role, onUpdated]);

  const request = async () => {
    if (!book) return;
    setSending(true);
    const r = await mobileApi("/api/v1/borrow-requests", { method: "POST", body: JSON.stringify({ bookId: book.id, ...(takenNow ? { takenNow: true } : {}) }), token: auth.token });
    setSending(false);
    // Success: close the sheet so the toast is visible (a native modal sits above everything, toasts included).
    if (r.ok) { onRequested(); onClose(); toast(takenNow
      ? { tone: "success", title: "Recorded: you took this book", message: `"${book.title}" is yours to use now. The librarian will confirm it and set the due date.` }
      : { tone: "success", title: "Borrow request sent", message: `"${book.title}" is waiting for librarian approval. Track it in My Books.` }); }
    else setError(r.message ?? "Could not send the request.");
  };

  const rate = async (stars: number, review?: string) => {
    if (!book) return;
    setRating(true);
    setError("");
    const r = await mobileApi(`/api/v1/catalog/${book.id}/rating`, { method: "PUT", body: JSON.stringify(review === undefined ? { stars } : { stars, review }), token: auth.token });
    setRating(false);
    if (!r.ok) return setError(r.message ?? "Could not save your rating.");
    const myReview = review === undefined ? book.myReview : review.trim() ? { text: review.trim(), status: "PENDING" } : null;
    onUpdated({ ...book, ...(r.data as { myRating: number; rating: { average: number; count: number } }), myReview });
    if (review !== undefined) toast({ tone: "success", title: review.trim() ? "Review sent" : "Review removed", message: review.trim() ? "Others will see it after the librarian approves it." : "" });
  };

  const toggleWatch = async () => {
    if (!book) return;
    setWatchBusy(true);
    const r = await mobileApi(`/api/v1/catalog/${book.id}/watch`, { method: book.watching ? "DELETE" : "PUT", body: "{}", token: auth.token });
    setWatchBusy(false);
    if (r.ok) {
      onUpdated({ ...book, watching: !book.watching });
      toast({ tone: "success", title: book.watching ? "Notification cancelled" : "We will notify you", message: book.watching ? "" : "You get an alert (and an email) when a copy is back on the shelf." });
    } else setError(r.message ?? "Please try again.");
  };

  const av = availabilityText(book?.availability);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2.5 border-b border-line last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink font-medium text-right">{value}</dd>
    </div>
  );

  return (
    <dialog ref={ref} aria-labelledby="book-sheet-title" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }} className="m-0 mt-auto w-full max-w-lg mx-auto max-h-[90vh] rounded-t-3xl bg-surface p-0 backdrop:bg-black/50 overflow-hidden">
      {book && (
        <div className="flex flex-col max-h-[90vh]">
          <div className="flex justify-center pt-2" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-slate-300" /></div>
          <div className="flex justify-between items-start gap-4 px-6 pt-3 pb-3">
            <h2 id="book-sheet-title" tabIndex={-1} autoFocus className="flex-1 text-xl font-bold text-primary-strong outline-none">{book.title}</h2>
            {auth.user?.role === "MEMBER" && <FavouriteButton bookId={book.id} title={book.title} favourite={!!book.favourite} size="lg" available={book.availability?.available} watching={!!book.watching} onChange={fav => onUpdated({ ...book, favourite: fav })} onWatch={w => onUpdated({ ...book, watching: w })} />}
            <button type="button" onClick={onClose} aria-label="Close" className={`w-11 h-11 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-ink-muted ${focusRing}`}><X size={18} aria-hidden="true" /></button>
          </div>

          {/* Scrolls when the details or description are long. */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 space-y-5">
            <div className="flex gap-4">
              <BookCover isbn={book.isbn} coverUrl={book.coverUrl} title={book.title} isNew={isNewBook(book.createdAt)} className="w-28 h-40 rounded-xl shadow shrink-0" />
              <div className="flex flex-col justify-center gap-3 min-w-0">
                <div className="flex gap-2">
                  <span className="flex flex-col items-center justify-center w-16 py-2 rounded-2xl bg-primary-soft text-primary" aria-label={`Borrowed ${book.borrowCount ?? 0} times`}>
                    <BookCheck size={20} aria-hidden="true" /><span className="text-lg font-bold leading-tight" aria-hidden="true">{book.borrowCount ?? 0}</span>
                  </span>
                  <span className="flex flex-col items-center justify-center w-16 py-2 rounded-2xl bg-primary-soft text-primary" aria-label={`Viewed ${book.viewCount ?? 0} times`}>
                    <Eye size={20} aria-hidden="true" /><span className="text-lg font-bold leading-tight" aria-hidden="true">{book.viewCount ?? 0}</span>
                  </span>
                </div>
                <Stars average={book.rating?.average ?? 0} count={book.rating?.count ?? 0} />
              </div>
            </div>

            <CategoryChips categories={book.categories} />

            <dl className="text-sm bg-page rounded-2xl px-4">
              {row("Author", book.authors || "Unknown")}
              {(book.bookType || book.gradeLevel) && row("Type · Grade level", [book.bookType, book.gradeLevel].filter(Boolean).join(" · "))}
              {row("Published", [book.publishedYear, book.publisher].filter(Boolean).join(" · ") || "N/A")}
              {row("ISBN", <span className="font-mono">{book.isbn || "N/A"}</span>)}
              {row("Serial number", <span className="font-mono">{book.serialNumber || "N/A"}</span>)}
              {row("Availability", <span className={av.ok ? "text-success" : "text-danger"}>{av.text}</span>)}
            </dl>

            <section aria-labelledby="book-desc">
              <h3 id="book-desc" className="text-sm font-semibold text-primary-strong mb-1">About this book</h3>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{book.description || "No description yet."}</p>
            </section>

            {auth.user?.role === "MEMBER" && (
              <section aria-labelledby="book-rate" className="bg-page rounded-2xl p-4 flex flex-col items-center text-center">
                <h3 id="book-rate" className="text-sm font-semibold text-primary-strong">{book.canRate && book.myRating ? "Your rating" : "Rate this book"}</h3>
                {book.canRate ? (
                  <>
                    <p className="text-xs text-ink-muted mb-2">{book.myRating ? "Tap a star to change it." : "Tap 1 to 5 stars."}</p>
                    <StarPicker value={book.myRating ?? null} onChange={s => rate(s)} disabled={rating} />
                    {book.myRating ? (
                      <div className="w-full mt-3 text-left">
                        <label htmlFor="my-review" className="text-xs font-semibold text-ink">Your review (optional)</label>
                        <textarea id="my-review" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} rows={3} placeholder="What did you like about this book?" className={`mt-1 w-full rounded-xl border border-line-strong bg-surface p-3 text-sm text-ink ${focusRing}`} />
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-xs text-ink-muted">{book.myReview?.status === "APPROVED" ? "Shown to others" : book.myReview?.status === "PENDING" ? "Waiting for librarian approval" : book.myReview?.status === "HIDDEN" ? "Hidden by the librarian" : `${draft.length}/500`}</span>
                          <button type="button" disabled={rating || draft.trim() === myText} onClick={() => rate(book.myRating!, draft)} className={`min-h-10 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 ${focusRing}`}>Save review</button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-ink-muted mt-1">Borrow this book first to rate it.</p>
                )}
              </section>
            )}
            {reviews.length > 0 && (
              <section aria-labelledby="book-reviews" className="space-y-2">
                <h3 id="book-reviews" className="text-sm font-semibold text-primary-strong flex items-center gap-1.5"><MessageSquareText size={16} aria-hidden="true" />What readers say</h3>
                <ul className="space-y-2">
                  {reviews.map(r => (
                    <li key={r.id} className="bg-page rounded-2xl p-3">
                      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-ink">{r.name}</span><span className="text-xs text-warning font-bold" aria-label={`${r.stars} of 5 stars`}>{"★".repeat(r.stars)}</span></div>
                      <p className="text-sm text-ink mt-1 whitespace-pre-line break-words">{r.review}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {error && <Alert>{error}</Alert>}
          </div>

          <div className="px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line bg-surface">
            {!av.ok && isMember ? (
              <button type="button" onClick={toggleWatch} disabled={watchBusy} aria-pressed={!!book.watching} className={book.watching ? `w-full min-h-12 rounded-2xl border-2 border-primary text-primary font-semibold flex items-center justify-center gap-2 ${focusRing}` : btnPrimary}>
                {watchBusy ? <Spinner /> : book.watching ? <BellOff size={18} aria-hidden="true" /> : <BellRing size={18} aria-hidden="true" />}
                {book.watching ? "Cancel notification" : "Notify me when available"}
              </button>
            ) : (
              <button type="button" onClick={request} disabled={sending || !av.ok} className={btnPrimary}>
                {sending ? <Spinner /> : <Send size={18} aria-hidden="true" />}
                {!av.ok ? av.text : sending ? "Sending…" : "Request to borrow"}
              </button>
            )}
            {!av.ok && isMember && <p className="text-xs text-danger text-center mt-2">{av.text}</p>}
            {av.ok && teacher && (
              <label className="mt-3 flex items-start gap-2.5 rounded-2xl border border-line bg-page px-3 py-2.5 text-sm text-ink">
                <input type="checkbox" checked={takenNow} onChange={e => setTakenNow(e.target.checked)} className="w-5 h-5 mt-0.5 accent-primary shrink-0" />
                <span><b>No librarian right now?</b> I already took this book from the shelf. <span className="text-ink-muted">(Teachers only; Time In at the Visitor's Log first. The librarian confirms it later.)</span></span>
              </label>
            )}
            <p className="text-xs text-ink-muted text-center mt-2">A librarian reviews every request. Borrow up to 8 books, 7 days each.</p>
          </div>
        </div>
      )}
    </dialog>
  );
}
