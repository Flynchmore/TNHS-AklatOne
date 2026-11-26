import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { BookOpen, History, UserCircle, ChevronRight, Clock, AlertCircle, Library, Newspaper, Lightbulb, DoorOpen, Medal, BookMarked, Bell } from "lucide-react";
import { BookCover, CurvedPanel, FloatingSearch, ListState, PhotoHeader, focusRing, isNewBook, linkText, mobileApi } from "../../components/mobile/ui";
import { useToast } from "../../components/Toast";

interface Book { id: string; title: string; authors?: string; isbn?: string | null; coverUrl?: string | null; createdAt?: string; availability?: { total: number; available: number } }
interface Tx { id: string; status: string; dueAt?: string; bookCopy?: { book?: { title: string } } }

// Shortcuts to screens of the member app: calm white tiles, each with its own soft-tinted icon (tokens keep >= 4.5:1).
const quickMenu = [
  { label: "Catalog", hint: "Find books", icon: BookOpen, path: "/m/catalog", chip: "bg-primary-soft text-primary" },
  { label: "History", hint: "Past books", icon: History, path: "/m/history", chip: "bg-info-soft text-info" },
  { label: "My Account", hint: "Profile", icon: UserCircle, path: "/m/profile", chip: "bg-warning-soft text-warning" },
  { label: "Newspaper", hint: "School news", icon: Newspaper, path: "/m/newspaper", chip: "bg-success-soft text-success" },
  { label: "Suggest", hint: "Ask for a book", icon: Lightbulb, path: "/m/suggestions", chip: "bg-accent-soft/50 text-on-accent" },
  { label: "Visit Log", hint: "Time in / out", icon: DoorOpen, path: "/m/visit", chip: "bg-danger-soft text-danger" },
  { label: "Top readers", hint: "Most active", icon: Medal, path: "/m/top-readers", chip: "bg-warning-soft text-warning" },
  { label: "My Books", hint: "Books with you", icon: BookMarked, path: "/m/loans", chip: "bg-primary-soft text-primary" },
  { label: "Alerts", hint: "Notices", icon: Bell, path: "/m/notifications", chip: "bg-success-soft text-success" },
];

export function MobileHome() {
  const auth = useAuth();
  const nav = useNavigate();
  const user = auth.user;
  const displayName = user?.displayName || user?.username || "Member";
  const firstName = displayName.split(" ")[0];
  const initials = displayName.charAt(0).toUpperCase();
  const [query, setQuery] = useState("");
  const [featured, setFeatured] = useState<Book[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState("");
  const [activeBorrows, setActiveBorrows] = useState<Tx[]>([]);
  const toast = useToast();

  useEffect(() => {
    // Welcome toast once per session (after sign-in), not on every tab switch.
    if (user && !sessionStorage.getItem("aklatone_welcome_shown")) {
      toast({ tone: "success", title: "Signed in successfully", message: `Welcome back, ${firstName}!` });
      sessionStorage.setItem("aklatone_welcome_shown", "1");
    }
  }, [user, firstName, toast]);

  const loadFeatured = useCallback(() => {
    setFeaturedLoading(true);
    setFeaturedError("");
    mobileApi("/api/v1/catalog?limit=10").then(r => {
      if (r.ok) setFeatured((r.data as { items?: Book[] } | null)?.items ?? []);
      else setFeaturedError(r.message ?? "Could not load books.");
      setFeaturedLoading(false);
    });
  }, []);

  useEffect(() => { loadFeatured(); }, [loadFeatured]);

  // Most borrowed this school week (titles only; never who borrowed them).
  const [week, setWeek] = useState<{ items: (Book & { times: number })[]; total: number } | null>(null);
  const [weekError, setWeekError] = useState("");
  const loadWeek = useCallback(() => {
    if (!auth.token) return;
    setWeekError("");
    mobileApi("/api/v1/catalog/this-week", { token: auth.token }).then(r => {
      if (r.ok) setWeek(r.data as { items: (Book & { times: number })[]; total: number }); else setWeekError(r.message ?? "Could not load this week's books.");
    });
  }, [auth.token]);
  useEffect(() => { loadWeek(); }, [loadWeek]);

  useEffect(() => {
    if (!auth.token || !auth.user) return;
    mobileApi(`/api/v1/circulation/transactions?borrowerId=${auth.user.id}&status=ACTIVE`, { token: auth.token }).then(r => {
      if (r.ok) setActiveBorrows((r.data as { items?: Tx[] } | null)?.items ?? (Array.isArray(r.data) ? (r.data as Tx[]) : []));
    });
  }, [auth.token, auth.user]);

  const [now] = useState(() => Date.now());
  const dueSoon = activeBorrows.filter(t => {
    if (!t.dueAt) return false;
    const days = (new Date(t.dueAt).getTime() - now) / 86400000;
    return days <= 3 && days >= 0;
  });

  const search = () => {
    nav(query.trim() ? `/m/catalog?q=${encodeURIComponent(query.trim())}` : "/m/catalog");
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <PhotoHeader>
        <div className="flex items-center gap-3 mb-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/50 shadow" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold text-on-primary border-2 border-white/50" aria-hidden="true">{initials}</div>
          )}
          <div>
            <p className="text-sm text-white/90">Welcome back</p>
            <h1 className="text-xl font-bold text-on-primary">Hello, {firstName}!</h1>
          </div>
        </div>
        <p className="text-sm text-white/90">Discover and keep track of your library books.</p>
      </PhotoHeader>

      <CurvedPanel label="Home">
          <FloatingSearch id="home-search" label="Search the library catalog" placeholder="Find a book or author" value={query} onChange={setQuery} onSubmit={search} buttonLabel="Search the catalog" />

          <section aria-labelledby="quick-menu">
            <h2 id="quick-menu" className="font-semibold text-primary-strong mb-3">Quick Menu</h2>
            <div className="grid grid-cols-3 gap-3">
              {quickMenu.map(q => {
                const Icon = q.icon;
                return (
                  <Link key={q.label} to={q.path} className={`group flex flex-col items-center justify-center gap-2 rounded-3xl bg-surface border border-line shadow-sm px-1 py-4 min-h-28 hover:border-primary/40 hover:shadow-md active:scale-95 transition landscape:min-h-0 landscape:flex-row landscape:py-3 ${focusRing}`}>
                    <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${q.chip} group-hover:scale-105 transition`} aria-hidden="true"><Icon size={24} strokeWidth={2.2} /></span>
                    <span className="text-center leading-tight">
                      <span className="block text-sm font-bold text-ink whitespace-nowrap">{q.label}</span>
                      <span className="block text-[11px] text-ink-muted whitespace-nowrap">{q.hint}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {dueSoon.length > 0 && (
            <section aria-labelledby="due-soon" className="bg-warning-soft border border-warning/40 rounded-2xl p-4">
              <h2 id="due-soon" className="flex items-center gap-2 mb-2 font-semibold text-warning text-sm">
                <AlertCircle size={18} aria-hidden="true" /> Due soon
              </h2>
              <ul className="space-y-1">
                {dueSoon.map(t => (
                  <li key={t.id} className="text-sm text-ink ml-6">
                    {t.bookCopy?.book?.title} — due {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeBorrows.length > 0 && (
            <section aria-labelledby="borrowed">
              <div className="flex items-center justify-between mb-3">
                <h2 id="borrowed" className="font-semibold text-primary-strong">Currently Borrowed</h2>
                <span className="text-sm text-ink-muted">{activeBorrows.length} item(s)</span>
              </div>
              <ul className="space-y-2">
                {activeBorrows.slice(0, 3).map(t => (
                  <li key={t.id} className="bg-surface rounded-2xl border border-line shadow-sm p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center shrink-0" aria-hidden="true"><Library className="text-primary" size={18} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink line-clamp-1">{t.bookCopy?.book?.title ?? "Unknown book"}</div>
                      <div className="text-sm text-ink-muted">Due: {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "Not set"}</div>
                    </div>
                    <Clock className="text-ink-muted" size={16} aria-hidden="true" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="this-week">
            <div className="flex items-center justify-between mb-3">
              <h2 id="this-week" className="font-semibold text-primary-strong">Popular this week</h2>
              {week && week.total > 0 && <span className="text-xs text-ink-muted">{week.total} borrowed Mon–Fri</span>}
            </div>
            <ListState loading={!week && !weekError && "Loading this week's books…"} skeleton="row" error={weekError} onRetry={loadWeek} empty={week?.items.length === 0 && "No books borrowed yet this week. Be the first!"}>
              <ul aria-label="Books borrowed this week, swipe for more" className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 pb-3 -mx-5 px-5 [scrollbar-width:none]">
                {week?.items.map((b, i) => (
                  <li key={b.id} className="w-36 shrink-0 snap-start">
                    <Link to={`/m/catalog?q=${encodeURIComponent(b.title)}`} className={`relative block h-full bg-surface rounded-2xl border border-line shadow-sm p-2.5 hover:border-primary transition ${focusRing}`}>
                      <span className="absolute z-10 top-1 left-1 w-7 h-7 rounded-full bg-primary-strong text-on-primary text-xs font-extrabold flex items-center justify-center shadow" aria-label={`Number ${i + 1}`}>{i + 1}</span>
                      <BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} className="w-full aspect-[2/3] rounded-xl mb-2 shadow-sm" />
                      <div className="text-sm font-semibold text-ink line-clamp-2">{b.title}</div>
                      <div className="text-sm text-ink-muted line-clamp-1 mt-0.5">{b.authors || "Unknown author"}</div>
                      <span className="inline-block mt-2 text-xs font-medium px-3 py-1 leading-tight rounded-full bg-primary-soft text-primary">Borrowed {b.times}×</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ListState>
          </section>

          <section aria-labelledby="featured">
            <div className="flex items-center justify-between mb-3">
              <h2 id="featured" className="font-semibold text-primary-strong">Featured Books</h2>
              <Link to="/m/catalog" className={`${linkText} text-sm flex items-center gap-0.5 min-h-6`}>
                See all <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <ListState
              loading={featuredLoading && "Loading books…"}
              skeleton="row"
              error={featuredError}
              onRetry={loadFeatured}
              empty={featured.length === 0 && (
                <>
                  <p>No books in the library catalog yet.</p>
                  <Link to="/m/openlibrary" className={`${linkText} inline-block mt-2 text-sm min-h-6`}>Browse Open Library (online, not school books)</Link>
                </>
              )}
            >
              <ul aria-label="Featured books, swipe for more" className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 pb-3 -mx-5 px-5 [scrollbar-width:none]">
                {featured.map(b => {
                  const available = (b.availability?.available ?? 0) > 0;
                  return (
                    <li key={b.id} className="w-36 shrink-0 snap-start">
                      <Link to={`/m/catalog?q=${encodeURIComponent(b.title)}`} className={`block h-full bg-surface rounded-2xl border border-line shadow-sm p-2.5 hover:border-primary transition ${focusRing}`}>
                        <BookCover isbn={b.isbn} coverUrl={b.coverUrl} title={b.title} isNew={isNewBook(b.createdAt)} className="w-full aspect-[2/3] rounded-xl mb-2 shadow-sm" />
                        <div className="text-sm font-semibold text-ink line-clamp-2">{b.title}</div>
                        <div className="text-sm text-ink-muted line-clamp-1 mt-0.5">{b.authors || "Unknown author"}</div>
                        {b.availability && (
                          <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 leading-tight rounded-2xl ${available ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                            {available ? `${b.availability.available} of ${b.availability.total} available` : "All copies borrowed"}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </ListState>
          </section>
      </CurvedPanel>
    </div>
  );
}
