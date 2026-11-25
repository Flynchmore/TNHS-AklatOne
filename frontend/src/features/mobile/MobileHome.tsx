import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { BookOpen, History, UserCircle, ChevronRight, Clock, AlertCircle, Library, Newspaper, Lightbulb, DoorOpen } from "lucide-react";
import { BookCover, CurvedPanel, FloatingSearch, ListState, PhotoHeader, focusRing, isNewBook, linkText, mobileApi } from "../../components/mobile/ui";
import { useToast } from "../../components/Toast";

interface Book { id: string; title: string; authors?: string; isbn?: string | null; coverUrl?: string | null; createdAt?: string; availability?: { total: number; available: number } }
interface Tx { id: string; status: string; dueAt?: string; bookCopy?: { book?: { title: string } } }

// Shortcuts to screens that exist in Member Mobile. Text keeps >= 4.5:1 across each gradient.
const quickMenu = [
  { label: "Catalog", icon: BookOpen, path: "/m/catalog", tile: "from-primary to-primary-strong text-on-primary" },
  { label: "History", icon: History, path: "/m/history", tile: "from-success to-success-strong text-on-primary" },
  { label: "My Account", icon: UserCircle, path: "/m/profile", tile: "from-accent-soft to-accent-strong text-on-accent" },
  { label: "Newspaper", icon: Newspaper, path: "/m/newspaper", tile: "from-primary-strong to-primary text-on-primary" },
  { label: "Suggest", icon: Lightbulb, path: "/m/suggestions", tile: "from-danger to-danger-strong text-on-primary" },
  { label: "Visit Log", icon: DoorOpen, path: "/m/visit", tile: "from-success to-success-strong text-on-primary" },
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
        <div className="flex items-center gap-3 mb-3 ak-fade">
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
        <p className="text-sm text-white/90 ak-fade">Discover and keep track of your library books.</p>
      </PhotoHeader>

      <CurvedPanel label="Home">
          <FloatingSearch id="home-search" label="Search the library catalog" placeholder="Find a book or author" value={query} onChange={setQuery} onSubmit={search} buttonLabel="Search the catalog" />

          <section aria-labelledby="quick-menu">
            <h2 id="quick-menu" className="font-semibold text-primary-strong mb-3">Quick Menu</h2>
            <div className="grid grid-cols-3 gap-3">
              {quickMenu.map(q => {
                const Icon = q.icon;
                return (
                  <Link key={q.label} to={q.path} className={`relative aspect-square rounded-3xl bg-gradient-to-br ${q.tile} shadow-md flex flex-col items-center justify-center gap-2 p-1 min-[360px]:p-2 hover:shadow-lg active:scale-95 transition landscape:aspect-auto landscape:h-24 landscape:flex-row landscape:gap-3 ${focusRing}`}>
                    {/* Decorative circles are clipped separately so the tile itself can grow to fit its label on very small phones. */}
                    <span className="absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
                      <span className="absolute -right-5 -top-5 w-16 h-16 rounded-full bg-white/15" />
                      <span className="absolute -left-4 -bottom-6 w-14 h-14 rounded-full bg-white/10" />
                    </span>
                    <span className="relative w-11 h-11 min-[360px]:w-14 min-[360px]:h-14 rounded-2xl bg-white/25 flex items-center justify-center" aria-hidden="true"><Icon size={26} strokeWidth={2.2} /></span>
                    <span className="relative text-xs min-[360px]:text-sm font-bold text-center leading-tight whitespace-nowrap">{q.label}</span>
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

          <section aria-labelledby="featured">
            <div className="flex items-center justify-between mb-3">
              <h2 id="featured" className="font-semibold text-primary-strong">Featured Books</h2>
              <Link to="/m/catalog" className={`${linkText} text-sm flex items-center gap-0.5 min-h-6`}>
                See all <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <ListState
              loading={featuredLoading && "Loading books…"}
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
                          <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${available ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
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
