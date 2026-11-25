import { Suspense, useState } from "react";
import { Skeleton } from "./staff/ui";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu, X, LogOut, LayoutDashboard, Library, ArrowLeftRight, Users, BarChart3, Printer, Settings, UploadCloud, Wifi, WifiOff, DoorOpen, Lightbulb, Newspaper, type LucideIcon } from "lucide-react";
import { useAuth } from "../features/auth/auth";
import { apiFetch } from "../lib/api";
import { useToast } from "./Toast";
import { focusRing } from "./mobile/ui";
import { isDesktop, useOnline, useOutbox } from "../lib/offline";
import { IdleLogout } from "./staff/IdleLogout";
import { useScreenTimeTracker } from "./mobile/screenTime";

type NavItem = { to: string; label: string; icon: LucideIcon; perm?: string };
const webLinks: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/catalog", label: "Catalog", icon: Library, perm: "catalog:read" },
  { to: "/borrowing", label: "Borrowing", icon: ArrowLeftRight, perm: "circulation:read" },
  { to: "/visitors", label: "Visitor's Log", icon: DoorOpen, perm: "circulation:write" },
  { to: "/members", label: "Members", icon: Users, perm: "users:read" },
  { to: "/suggestions", label: "Suggestions", icon: Lightbulb, perm: "circulation:read" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "reports:read" },
  { to: "/printing", label: "Printing", icon: Printer, perm: "reports:read" },
  { to: "/newspaper", label: "School Newspaper", icon: Newspaper },
  { to: "/settings", label: "Settings", icon: Settings },
];
// Desktop app (Tauri), "Offline Mode" of AklatOne LMS: the same sections as the web, plus Upload for changes made offline.
const desktopLinks: NavItem[] = [...webLinks.slice(0, -1), { to: "/upload", label: "Upload", icon: UploadCloud }, webLinks[webLinks.length - 1]!];
export const navLinks = (desktop = isDesktop) => (desktop ? desktopLinks : webLinks);

export function Layout() {
  const { user, token, logout, hasPerm } = useAuth();
  const location = useLocation();
  // Librarian's app time (Time Spent), like the members'.
  useScreenTimeTracker(user?.id, token, isDesktop ? "desktop" : "web");
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Pending borrow requests badge on "Borrowing" (same query key as the Dashboard, so it is fetched once).
  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: async () => { const r = await apiFetch("/api/v1/reports/summary", { token }); if (!r.ok) throw Object.assign(new Error(r.message), { status: r.status }); return r.data as Record<string, number>; },
    enabled: !!token && hasPerm("reports:read"),
    refetchInterval: 60_000,
  });
  const pending = summary?.pendingRequests ?? 0;
  const online = useOnline();
  const waiting = useOutbox().length;
  const badge = (to: string) => (to === "/borrowing" || to === "/transactions" ? pending : to === "/upload" ? waiting : to === "/suggestions" ? (summary?.newSuggestions ?? 0) + (summary?.pendingReviews ?? 0) : 0);

  const signOut = () => {
    logout();
    toast({ tone: "info", title: "Signed out", message: "You have signed out of the AklatOne staff portal." });
    nav("/login");
  };

  return (
    <div className="min-h-[calc(100vh-var(--ak-titlebar,0px))] bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-surface focus:text-primary focus:px-4 focus:py-2 focus:rounded-xl">Skip to content</a>

      {/* Fixed sidebar: never scrolls with the page, so the menu and Logout stay in place. */}
      <aside className={`ak-no-print fixed top-[var(--ak-titlebar,0px)] bottom-0 left-0 z-40 w-72 text-white flex flex-col overflow-hidden bg-primary-strong motion-safe:transition-transform motion-safe:duration-300 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Same look as the phone app's sign-in: navy with the school seal low in the background (menu text stays clear). */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary via-primary-strong to-primary-strong" aria-hidden="true" />
        <img src="/tnhs-logo.png" alt="" aria-hidden="true" className="ak-watermark absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2 w-[26rem] max-w-none opacity-[0.10] pointer-events-none" />

        {/* Short windows (e.g. the 800 px desktop window) get a compact sidebar so every item stays visible. */}
        <div className="relative flex flex-col items-center text-center px-5 pt-7 pb-5 [@media(max-height:880px)]:pt-4 [@media(max-height:880px)]:pb-3 border-b border-white/15">
          <button className={`md:hidden absolute right-3 top-3 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 ${focusRing}`} onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} aria-hidden="true" /></button>
          <img src="/tnhs-logo.png" alt="Tagumpay National High School seal" className="w-20 h-20 [@media(max-height:880px)]:w-14 [@media(max-height:880px)]:h-14 [@media(max-height:700px)]:w-11 [@media(max-height:700px)]:h-11 rounded-full bg-white p-1 shadow-xl ring-4 ring-accent/70 motion-safe:transition-transform motion-safe:duration-500 hover:rotate-[360deg]" />
          <p className="mt-3 text-base font-bold leading-tight [@media(max-height:880px)]:hidden">Tagumpay National<br />High School</p>
          <p className="text-xs text-accent font-semibold mt-1 tracking-wide uppercase [@media(max-height:880px)]:hidden">School Library</p>
        </div>

        {/* Scrolls only if the window is very short, and never shows a scrollbar. */}
        <nav aria-label="Main" className="relative flex-1 overflow-y-auto ak-no-scrollbar px-4 py-5 [@media(max-height:880px)]:py-3">
          <ul className="flex flex-col gap-2 [@media(max-height:880px)]:gap-1">
            {navLinks().filter(l => !l.perm || hasPerm(l.perm)).map(l => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.to === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `group relative flex items-center gap-3 min-h-12 [@media(max-height:880px)]:min-h-9 [@media(max-height:700px)]:min-h-8 px-4 rounded-2xl text-sm font-semibold motion-safe:transition-all motion-safe:duration-200 active:scale-[0.97] ${focusRing} ${isActive ? "bg-white text-[#1E326D] shadow-lg shadow-black/20" : "text-white/90 hover:bg-white/12 hover:text-white hover:translate-x-1"}`}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-2.5 bottom-2.5 w-1.5 rounded-r-full bg-accent" aria-hidden="true" />}
                      <l.icon size={20} aria-hidden="true" className={`shrink-0 motion-safe:transition-transform motion-safe:duration-200 ${isActive ? "text-[#3354B5]" : "group-hover:scale-110"}`} />
                      <span className="flex-1">{l.label}</span>
                      {badge(l.to) > 0 && <span className={`min-w-6 h-6 px-1.5 rounded-full text-white text-xs font-bold flex items-center justify-center ak-badge-pop ${l.to === "/upload" ? "bg-warning" : "bg-danger"}`} aria-label={l.to === "/upload" ? `${badge(l.to)} waiting to upload` : `${badge(l.to)} pending requests`}>{badge(l.to) > 99 ? "99+" : badge(l.to)}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="relative px-4 pt-4 pb-5 [@media(max-height:880px)]:pt-3 [@media(max-height:880px)]:pb-3 [@media(max-height:880px)]:space-y-2 border-t border-white/15 space-y-3">
          {/* Desktop: always visible at the end of the menu (this part never scrolls). */}
          {isDesktop && <SystemStatus online={online} waiting={waiting} />}
          <div className="flex items-center gap-3 px-2 [@media(max-height:880px)]:hidden">
            <img src="/aklatone-icon.png" alt="" className="w-11 h-11 [@media(max-height:880px)]:w-9 [@media(max-height:880px)]:h-9 rounded-xl bg-white p-1 shadow-md" />
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">AklatOne</p>
              <p className="text-xs text-white/80 truncate">{user?.displayName || user?.username}{user?.position ? ` · ${user.position}` : ""}</p>
            </div>
          </div>
          <button type="button" className={`group w-full flex items-center justify-center gap-2 min-h-11 rounded-2xl bg-white/10 border border-white/20 text-sm font-semibold motion-safe:transition-all hover:bg-danger hover:border-danger active:scale-[0.97] ${focusRing}`} onClick={signOut}>
            <LogOut size={18} aria-hidden="true" className="motion-safe:transition-transform group-hover:-translate-x-0.5" /> Logout
          </button>
        </div>
      </aside>

      {open && <div className="ak-no-print fixed inset-0 bg-black/50 z-30 md:hidden ak-fade" onClick={() => setOpen(false)} aria-hidden="true" />}

      {/* Blurred school seal behind every page (decorative). */}
      <div className="ak-no-print pointer-events-none fixed top-[var(--ak-titlebar,0px)] bottom-0 right-0 left-0 md:left-72 flex items-center justify-center overflow-hidden" aria-hidden="true">
        <img src="/tnhs-logo.png" alt="" className="ak-watermark w-[min(80vw,40rem)] aspect-square object-contain opacity-[0.07] [transform:translateZ(0)]" />
      </div>

      <div className="relative md:pl-72">
        <div className="ak-no-print md:hidden sticky top-[var(--ak-titlebar,0px)] z-20 flex items-center gap-3 px-4 py-3 bg-primary-strong text-white shadow-md">
          <button className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 ${focusRing}`} onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} aria-hidden="true" /></button>
          <img src="/aklatone-icon.png" alt="" className="w-8 h-8 rounded-lg bg-white p-0.5" />
          <span className="font-bold">AklatOne</span>
        </div>
        <main id="main" className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          <Suspense fallback={<Skeleton rows={6} />}><div key={location.pathname} className="ak-page"><Outlet /></div></Suspense>
          {!isDesktop && <IdleLogout onTimeout={() => { logout(true); nav("/login"); }} />}
        </main>
      </div>
    </div>
  );
}

/** Desktop: connection status under Settings. Online = green signal with a calm pulse; Offline = amber, wobbling icon and blinking dot. */
export function SystemStatus({ online, waiting }: { online: boolean; waiting: number }) {
  return (
    <div role="status" aria-live="polite" key={String(online)} className={`flex items-center gap-3 px-4 py-3 [@media(max-height:700px)]:py-2 rounded-2xl border ak-scale ${online ? "bg-success/20 border-success/40" : "bg-warning/25 border-warning/60"}`}>
      <span className="relative w-10 h-10 shrink-0 flex items-center justify-center" aria-hidden="true">
        {online && <span className="absolute inset-1 rounded-full bg-success/60 ak-signal-pulse" />}
        <span className={`relative w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md ${online ? "bg-gradient-to-br from-success to-success-strong" : "bg-gradient-to-br from-warning to-[#7A3A06]"}`}>
          {online ? <Wifi size={20} /> : <WifiOff size={20} className="ak-wobble" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          {online ? "System Online" : "System Offline"}
          <span className={`w-2 h-2 rounded-full ${online ? "bg-[#4ADE80]" : "bg-accent ak-blink"}`} aria-hidden="true" />
        </span>
        <span className="block text-xs text-white/80 leading-snug [@media(max-height:700px)]:hidden">
          {online ? (waiting ? `${waiting} change${waiting === 1 ? "" : "s"} ready to upload` : "Connected to the web") : "Changes are saved on this computer"}
        </span>
      </span>
    </div>
  );
}
