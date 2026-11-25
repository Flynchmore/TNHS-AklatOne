import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, BookOpen, Library, Bell, User, WifiOff } from "lucide-react";
import { useOnline } from "../../lib/offline";
import { useAuth } from "../../features/auth/auth";
import { SkeletonList, mobileApi } from "./ui";
import { PullToRefresh } from "./PullToRefresh";
import { useScreenTimeTracker } from "./screenTime";

type BadgeKey = "catalog" | "loans" | "alerts" | "profile";
const nav: { to: string; label: string; icon: typeof Home; also?: string[]; badge?: BadgeKey }[] = [
  { to: "/m", label: "Home", icon: Home },
  { to: "/m/catalog", label: "Catalog", icon: BookOpen, badge: "catalog" },
  { to: "/m/loans", label: "My Books", icon: Library, also: ["/m/receipt"], badge: "loans" },
  { to: "/m/notifications", label: "Alerts", icon: Bell, badge: "alerts" },
  { to: "/m/profile", label: "Profile", icon: User, also: ["/m/history", "/m/settings"], badge: "profile" },
];
const badgeWord: Record<BadgeKey, string> = { catalog: "new books", loans: "request updates", alerts: "new alerts", profile: "new returns" };

export interface BadgeSources {
  notes: { type: string; createdAt: string; readAt?: string | null }[];
  requests: { status: string; reviewedAt?: string | null; transaction?: { returnedAt?: string | null } | null }[];
  books: { createdAt?: string }[];
}
type Seen = Partial<Record<BadgeKey, number>>;

/** Counts what arrived after the member last opened each tab. Alerts also rings while an unread librarian notice is new. */
export function computeBadges({ notes, requests, books }: BadgeSources, seen: Seen) {
  const after = (iso: string | null | undefined, key: BadgeKey) => !!iso && new Date(iso).getTime() > (seen[key] ?? 0);
  const fresh = notes.filter(n => !n.readAt && after(n.createdAt, "alerts"));
  return {
    counts: {
      catalog: books.filter(b => after(b.createdAt, "catalog")).length,
      loans: requests.filter(r => (r.status === "APPROVED" || r.status === "REJECTED") && after(r.reviewedAt, "loans")).length,
      alerts: fresh.length,
      profile: requests.filter(r => after(r.transaction?.returnedAt, "profile")).length,
    } as Record<BadgeKey, number>,
    ring: fresh.some(n => n.type === "OVERDUE" || n.type === "DUE_SOON"),
  };
}

const seenKey = (userId: string) => `aklatone_seen_${userId}`;
function readSeen(userId: string): Seen {
  try { return JSON.parse(localStorage.getItem(seenKey(userId)) ?? "null") ?? {}; } catch { return {}; }
}
function writeSeen(userId: string, seen: Seen) {
  try { localStorage.setItem(seenKey(userId), JSON.stringify(seen)); } catch { /* private mode: badges just won't persist */ }
}

export function MobileLayout() {
  const location = useLocation();
  const { token, user } = useAuth();
  const [badges, setBadges] = useState<ReturnType<typeof computeBadges>>({ counts: { catalog: 0, loans: 0, alerts: 0, profile: 0 }, ring: false });
  const [refreshKey, setRefreshKey] = useState(0);
  // Coming back to the app after a minute away reloads the screen, so borrowed books and alerts match the library's records.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) setRefreshKey(k => k + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useScreenTimeTracker(user?.id, token, "mobile");
  const current = nav.find(n => location.pathname === n.to || n.also?.some(p => location.pathname.startsWith(p)))?.badge;
  const lastBadges = useRef(0);
  const loadUnread = useCallback(async (force = false) => {
    if (!token || !user) return;
    // Badges are not worth more than one check every 15 s (screen changes often come in quick bursts).
    if (!force && Date.now() - lastBadges.current < 15_000) return;
    lastBadges.current = Date.now();
    const [n, r, b] = await Promise.all([
      mobileApi("/api/v1/notifications/mine", { token }),
      mobileApi("/api/v1/borrow-requests/mine", { token }),
      mobileApi("/api/v1/catalog?limit=20&sortBy=createdAt&sortOrder=desc", { token }),
    ]);
    const seen = readSeen(user.id);
    const now = Date.now();
    // First run on this phone: start counting from now, except Alerts, which shows everything unread.
    for (const k of ["catalog", "loans", "profile"] as const) seen[k] ??= now;
    // Opening a tab clears its number (and stops the bell).
    if (current) seen[current] = now;
    writeSeen(user.id, seen);
    setBadges(computeBadges({
      notes: (n.ok && (n.data as { items?: BadgeSources["notes"] } | null)?.items) || [],
      requests: (r.ok && (r.data as { items?: BadgeSources["requests"] } | null)?.items) || [],
      books: (b.ok && (b.data as { items?: BadgeSources["books"] } | null)?.items) || [],
    }, seen));
  }, [token, user, current]);
  // Refresh the badges whenever the member changes screen.
  // (Opening a tab that has a badge always checks, so its number clears at once.)
  useEffect(() => { loadUnread(!!current); }, [loadUnread, location.pathname, current]);
  // ...and every 60 s while the app is open, so a new librarian notice shows up without navigating.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") loadUnread(); }, 60_000);
    return () => clearInterval(t);
  }, [loadUnread]);
  // Pull-to-refresh remounts the current screen, so it reloads all of its data.
  const refresh = useCallback(async () => { setRefreshKey(k => k + 1); await loadUnread(true); }, [loadUnread]);
  const online = useOnline();
  return (
    <div className="min-h-screen bg-page flex flex-col">
      {!online && (
        <div role="status" className="sticky top-0 z-50 flex items-center gap-3 px-4 py-2 bg-warning-soft text-warning text-sm font-semibold border-b border-warning/30" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <span className="w-9 h-9 shrink-0 rounded-xl bg-warning/15 flex items-center justify-center" aria-hidden="true"><WifiOff size={22} strokeWidth={2.4} /></span>
          <span>Offline: Showing what was saved on this phone. Borrowing and changes need the internet.</span>
        </div>
      )}
      <PullToRefresh onRefresh={refresh}>
        {/* Clip sideways overflow so slide-in animations never widen the page (which makes phones zoom out). */}
        <main className="flex-1 pb-24 overflow-x-clip">
          <Suspense fallback={<div className="p-5 pt-16"><SkeletonList label="Loading…" /></div>}><div key={`${location.pathname}-${refreshKey}`} className="ak-page"><Outlet /></div></Suspense>
        </main>
      </PullToRefresh>
      <nav aria-label="Main" className="ak-mobile-nav fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-line flex justify-around items-stretch z-40 px-1 shadow-[0_-6px_20px_rgba(30,50,109,0.08)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {nav.map(n => {
          const Icon = n.icon;
          // Sub-pages without their own tab keep their parent tab raised (Receipt -> My Books, History -> Profile).
          const active = location.pathname === n.to || !!n.also?.some(p => location.pathname.startsWith(p));
          const count = n.badge && !active ? badges.counts[n.badge] : 0;
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className={`group flex-1 min-h-16 flex flex-col items-center justify-end pb-1.5 gap-1 text-xs rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${active ? "text-primary font-semibold" : "text-ink-muted"}`}
            >
              {/* The current tab's icon rises into a raised circle (springy overshoot); others sit flat. */}
              <span
                className={`relative flex items-center justify-center rounded-full motion-safe:transition-all motion-safe:duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] group-active:scale-90 ${
                  active
                    ? "w-12 h-12 -translate-y-4 bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-lg shadow-primary/40 ring-4 ring-surface"
                    : "w-10 h-8 translate-y-0 bg-transparent"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" className={n.badge === "alerts" && badges.ring && !active ? "ak-ring" : undefined} />
                {count > 0 && (
                  <span key={count} className="ak-badge-pop absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-danger text-on-primary text-[11px] font-bold flex items-center justify-center ring-2 ring-surface" aria-hidden="true">{count > 9 ? "9+" : count}</span>
                )}
              </span>
              <span className={`motion-safe:transition-transform motion-safe:duration-500 ${active ? "-translate-y-2" : ""}`}>{n.label}{count > 0 && <span className="sr-only">, {count} {badgeWord[n.badge!]}</span>}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
