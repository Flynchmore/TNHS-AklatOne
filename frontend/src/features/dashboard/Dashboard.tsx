import { useQuery } from "@tanstack/react-query";
import { RefreshButton } from "../../components/RefreshButton";
import { Link } from "react-router-dom";
import { BookOpen, Users, BookUp, CalendarClock, History, Zap, BookPlus, ClipboardCheck, UserPlus, BellRing, Printer, BarChart3, Library, ArrowLeftRight, Tag, UserCog, ShieldCheck, ChevronRight, type LucideIcon } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { Panel, StatTile, Skeleton, btn, btnSm, card } from "../../components/staff/ui";
import { focusRing } from "../../components/mobile/ui";
import { timeAgo } from "../mobile/MobileNotifications";
import { phHour, phLongDate } from "../../lib/dates";
import { txPath } from "../../lib/offline";
import { ThisWeek } from "./ThisWeek";

interface Summary { titles: number; copies: number; activeLoans: number; overdueLoans: number; members: number; dueThisWeek: number; pendingRequests: number }
interface Activity { id: string; action: string; entityType: string; createdAt: string; actor?: { username: string; displayName?: string | null } | null }

/** Plain-English text for audit actions (unknown ones fall back to the raw action). */
const ACTIVITY: Record<string, string> = {
  "book.create": "added a book to the catalog", "book.update": "updated a book", "book.delete": "deleted a book",
  "bookCopy.create": "added a book copy", "bookCopy.statusChange": "changed a copy's status", "bookCopy.delete": "removed a book copy",
  "borrowRequest.create": "requested to borrow a book", "borrowRequest.approve": "approved a borrow request", "borrowRequest.reject": "declined a borrow request",
  "circulation.borrow": "lent a book", "circulation.return": "recorded a returned book",
  "notification.overdue": "sent an overdue notice", "notification.reminder": "sent a return reminder",
  "category.create": "added a category", "category.update": "updated a category", "category.delete": "deleted a category",
  "setup.librarian": "set up the librarian account", "user.register": "registered in the mobile app",
  "user.create": "added a member", "user.update": "updated a member", "user.activate": "activated a member", "user.deactivate": "deactivated a member",
};
const ENTITY_ICON: Record<string, LucideIcon> = { Book: Library, BookCopy: BookOpen, BorrowRequest: ClipboardCheck, BorrowingTransaction: ArrowLeftRight, Category: Tag, User: UserCog };

const greeting = (h = phHour()) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

export function Dashboard() {
  const { user, token, logout, hasPerm } = useAuth();
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: async () => {
      const r = await apiFetch("/api/v1/reports/summary", { token });
      if (r.status === 401) logout(true);
      if (!r.ok) throw new Error(r.message);
      return r.data as Summary;
    },
    enabled: !!token,
  });
  const activity = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => { const r = await apiFetch("/api/v1/reports/recent-activity?limit=7", { token }); if (!r.ok) throw new Error(r.message); return (r.data as { items: Activity[] }).items; },
    enabled: !!token,
  });
  const s = summary.data;
  const name = (user?.displayName || user?.username || "Librarian").split(" ")[0];

  const refresh = async () => (await Promise.all([summary.refetch(), activity.refetch()])).map(r => ({ isError: r.isError }));

  const actions: { to: string; label: string; hint: string; icon: LucideIcon; cls: string }[] = [
    { to: "/catalog?new=1", label: "Add a book", hint: "New title and copies", icon: BookPlus, cls: "from-primary to-primary-strong" },
    { to: txPath, label: "Review requests", hint: s?.pendingRequests ? `${s.pendingRequests} waiting` : "Approve or decline", icon: ClipboardCheck, cls: "from-success to-success-strong" },
    { to: "/members?new=1", label: "Add a member", hint: "Student or teacher", icon: UserPlus, cls: "from-[#6D28D9] to-[#3B0F86]" },
    { to: `${txPath}?tab=borrowed`, label: "Send notices", hint: "Overdue and reminders", icon: BellRing, cls: "from-warning to-[#7A3A06]" },
    { to: "/printing", label: "Print lists", hint: "Inventory, overdue, members", icon: Printer, cls: "from-danger to-danger-strong" },
    { to: "/reports", label: "View reports", hint: "Borrowing statistics", icon: BarChart3, cls: "from-[#0E7490] to-[#0B3F52]" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome banner over the school photo. */}
      <section aria-label="Welcome" className="relative overflow-hidden rounded-3xl shadow-xl">
        <div className="absolute inset-0 bg-cover bg-center ak-bg-drift" style={{ backgroundImage: "url('/tnhs-facade.webp')" }} aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-strong/95 via-primary/80 to-primary/35" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-6 sm:p-10 text-white min-h-52">
          <div className="max-w-xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent"><img src="/tnhs-logo.png" alt="" className="w-6 h-6 rounded-full bg-white p-0.5" />Tagumpay National High School Library</p>
            <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight">{greeting()}, {name}!</h1>
            <p className="mt-2 text-white/90">Welcome to AklatOne. {s ? (s.pendingRequests ? `You have ${s.pendingRequests} borrow request${s.pendingRequests === 1 ? "" : "s"} waiting for review.` : "No borrow requests are waiting right now.") : "Here is today's library at a glance."}</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <p className="text-sm font-medium text-white/90 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5">{phLongDate()}</p>
            <RefreshButton onRefresh={refresh} what="the dashboard" onDark />
          </div>
        </div>
      </section>

      {summary.isError && <p role="alert" className="text-danger">Could not load the statistics. <button className="underline" onClick={() => summary.refetch()}>Try again</button></p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summary.isLoading ? <div className="col-span-full"><Skeleton rows={1} className="h-36" /></div> : (
          <>
            <StatTile icon={BookOpen} label="Total Books" value={s?.titles ?? 0} hint={`${s?.copies ?? 0} copies on the shelves`} to="/catalog" />
            <StatTile icon={Users} label="Total Members" value={s?.members ?? 0} hint="Active students and teachers" tone="success" to="/members" />
            <StatTile icon={BookUp} label="Currently Borrowed" value={s?.activeLoans ?? 0} hint={s?.overdueLoans ? `${s.overdueLoans} overdue` : "None overdue"} tone={s?.overdueLoans ? "danger" : "primary"} to={`${txPath}?tab=borrowed`} />
            <StatTile icon={CalendarClock} label="Due This Week" value={s?.dueThisWeek ?? 0} hint="Due in the next 7 days" tone="warning" to={`${txPath}?tab=borrowed`} />
          </>
        )}
      </div>

      {hasPerm("reports:read") && <ThisWeek />}

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <Panel title="Recent Activities" icon={History} action={<Link to="/reports" className={`${btn.ghost} ${btnSm}`}>Reports<ChevronRight size={14} aria-hidden="true" /></Link>}>
          {activity.isLoading ? <Skeleton rows={5} className="h-12" /> : activity.isError ? <p role="alert" className="text-danger text-sm">Could not load recent activities.</p> : !activity.data?.length ? <p className="text-ink-muted text-sm py-6 text-center">No activity yet.</p> : (
            <ol className="relative space-y-1 before:absolute before:left-5 before:top-3 before:bottom-3 before:w-px before:bg-line">
              {activity.data.map((a, i) => {
                const Icon = ENTITY_ICON[a.entityType] ?? ShieldCheck;
                return (
                  <li key={a.id} className="relative flex items-start gap-3 p-2 rounded-2xl motion-safe:transition-colors hover:bg-primary-soft/50" style={{ animationDelay: `${0.3 + i * 0.04}s` }}>
                    <span className="relative z-10 w-10 h-10 rounded-xl bg-surface border border-line text-primary flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true"><Icon size={18} /></span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm text-ink"><strong className="font-semibold">{a.actor?.displayName || a.actor?.username || "System"}</strong> {ACTIVITY[a.action] ?? a.action}</p>
                      <p className="text-xs text-ink-muted">{timeAgo(a.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel title="Quick Actions" icon={Zap}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 content-start">
            {actions.map((a, i) => (
              <Link key={a.label} to={a.to} className={`group relative overflow-hidden flex items-center gap-3 p-4 ${card} motion-safe:transition-all motion-safe:duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/40 active:scale-[0.97] ${focusRing}`} style={{ animationDelay: `${0.35 + i * 0.05}s` }}>
                <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${a.cls} text-white flex items-center justify-center shrink-0 shadow-md motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-110 group-hover:rotate-6`} aria-hidden="true"><a.icon size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink group-hover:text-primary">{a.label}</span>
                  <span className="block text-xs text-ink-muted">{a.hint}</span>
                </span>
                <ChevronRight size={18} className="text-ink-muted motion-safe:transition-transform group-hover:translate-x-1 group-hover:text-primary" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
