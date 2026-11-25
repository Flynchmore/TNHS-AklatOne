import { useState, useEffect, useRef } from "react";
import { Search, BookOpen, X, User, Calendar } from "lucide-react";
import { ListState, ScreenShell, btnPrimary, focusRing } from "../../components/mobile/ui";

interface OLBook {
  key: string;
  title: string;
  authors: string[];
  coverId?: number;
  firstPublishYear?: number;
  subject?: string[];
}

interface OLDetail extends OLBook {
  description: string;
  subjects: string[];
}

const OL_ERROR = "Can't reach Open Library. Check your internet connection and try again.";

export function MobileOpenLibrary() {
  const [query, setQuery] = useState("library");
  const [books, setBooks] = useState<OLBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OLDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const fetchBooks = (q: string) => {
    setLoading(true);
    setError("");
    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20`, { signal: AbortSignal.timeout(15000) })
      .then(res => res.json())
      .then(data => {
        setBooks((data.docs ?? []).map((v: { key?: string; cover_i?: number; title?: string; author_name?: string[]; first_publish_year?: number; subject?: string[] }) => ({
          key: v.key ?? String(v.cover_i ?? v.title),
          title: v.title ?? "Unknown Title",
          authors: v.author_name ?? [],
          coverId: v.cover_i,
          firstPublishYear: v.first_publish_year,
          subject: v.subject?.slice(0, 3),
        })));
        setLoading(false);
      })
      .catch(() => { setBooks([]); setError(OL_ERROR); setLoading(false); });
  };

  useEffect(() => { fetchBooks("library"); }, []);

  // Native modal dialog: focus trap, Escape to close and aria-modal come from the browser.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (selected && !d.open) d.showModal?.();
    if (!selected && d.open) d.close();
  }, [selected]);

  const openDetail = async (book: OLBook) => {
    setDetailLoading(true);
    setSelected({ ...book, description: "", subjects: book.subject ?? [] });
    try {
      const workKey = book.key.startsWith("/works/") ? book.key : `/works/${book.key.split("/").pop()}`;
      const res = await fetch(`https://openlibrary.org${workKey}.json`, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      const desc = typeof data.description === "string" ? data.description : data.description?.value ?? "No description available.";
      setSelected({ ...book, description: desc, subjects: data.subjects?.slice(0, 6) ?? book.subject ?? [] });
    } catch {
      setSelected({ ...book, description: "Could not load details.", subjects: book.subject ?? [] });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <ScreenShell title="Open Library" subtitle="Books from the internet, not the school library" back="/m" headerExtra={
        <form role="search" onSubmit={e => { e.preventDefault(); fetchBooks(query); }} className="mt-4 bg-white/15 rounded-full flex items-center gap-2 pl-4 pr-1 focus-within:ring-2 focus-within:ring-white">
          <Search className="text-white/85 shrink-0" size={18} aria-hidden="true" />
          <label htmlFor="ol-search" className="sr-only">Search Open Library</label>
          <input id="ol-search" type="search" enterKeyHint="search" className="flex-1 min-h-11 bg-transparent text-on-primary placeholder:text-white/80 outline-none text-sm" placeholder="Search by title or author" value={query} onChange={e => setQuery(e.target.value)} />
          <button type="submit" className="min-h-10 px-3 rounded-lg text-on-primary text-sm font-medium bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Search</button>
        </form>
    }>
      <div>
        <ListState loading={loading && "Loading books…"} error={error} onRetry={() => fetchBooks(query)} empty={books.length === 0 && "No books found."}>
          <ul className="grid grid-cols-2 landscape:grid-cols-4 gap-3">
            {books.map(b => (
              <li key={b.key}>
                <button type="button" onClick={() => openDetail(b)} className={`w-full h-full bg-surface rounded-2xl border border-line shadow-sm overflow-hidden text-left hover:border-primary active:scale-[0.97] transition ${focusRing}`}>
                  {b.coverId ? (
                    <img src={`https://covers.openlibrary.org/b/id/${b.coverId}-M.jpg`} alt="" loading="lazy" className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-primary-soft flex items-center justify-center" aria-hidden="true"><BookOpen className="text-primary/50" size={32} /></div>
                  )}
                  <div className="p-3">
                    <div className="text-sm font-semibold text-ink line-clamp-2">{b.title}</div>
                    <div className="text-sm text-ink-muted line-clamp-1 mt-0.5">{b.authors.join(", ") || "Unknown author"}</div>
                    {b.firstPublishYear && <div className="text-xs text-ink-muted mt-1">{b.firstPublishYear}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </ListState>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="ol-detail-title"
        onClose={() => setSelected(null)}
        onClick={e => { if (e.target === dialogRef.current) setSelected(null); }}
        className="m-0 mt-auto w-full max-w-lg mx-auto max-h-[85vh] rounded-t-3xl bg-surface p-0 backdrop:bg-black/50"
      >
        {selected && (
          <div className="p-6 overflow-y-auto">
            <div className="flex justify-between items-start gap-4 mb-4">
              <h2 id="ol-detail-title" className="text-xl font-bold text-primary-strong">{selected.title}</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className={`w-11 h-11 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-ink-muted ${focusRing}`}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex gap-4 mb-4">
              {selected.coverId ? (
                <img src={`https://covers.openlibrary.org/b/id/${selected.coverId}-L.jpg`} alt={`Cover of ${selected.title}`} className="w-28 h-40 object-cover rounded-xl shadow" />
              ) : (
                <div className="w-28 h-40 bg-primary-soft rounded-xl flex items-center justify-center" aria-hidden="true"><BookOpen className="text-primary/50" size={32} /></div>
              )}
              <div className="flex-1 space-y-2 text-sm text-ink">
                <p className="flex items-center gap-2"><User size={14} className="text-ink-muted" aria-hidden="true" />{selected.authors.join(", ") || "Unknown author"}</p>
                {selected.firstPublishYear && <p className="flex items-center gap-2"><Calendar size={14} className="text-ink-muted" aria-hidden="true" />First published {selected.firstPublishYear}</p>}
                {selected.subjects.length > 0 && (
                  <ul className="flex flex-wrap gap-1 mt-2" aria-label="Subjects">
                    {selected.subjects.slice(0, 4).map(s => <li key={s} className="text-xs bg-primary-soft text-primary px-3 py-1 leading-tight rounded-full">{s}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <h3 className="text-sm font-semibold text-primary-strong mb-1">Description</h3>
            <p className="text-sm text-ink leading-relaxed mb-4">{detailLoading ? "Loading details…" : selected.description}</p>
            <a href={`https://openlibrary.org${selected.key}`} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              View on Open Library<span className="sr-only"> (opens in browser)</span>
            </a>
          </div>
        )}
      </dialog>
    </ScreenShell>
  );
}
