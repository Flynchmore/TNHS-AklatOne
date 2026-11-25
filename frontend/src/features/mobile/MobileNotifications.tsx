import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, BookCheck, Bell, AlarmClock, Inbox, Megaphone, BellRing, CheckCheck, Lightbulb } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { ListState, ScreenShell, SlidingTabs, focusRing, mobileApi, useSlideDirection, type TabDef } from "../../components/mobile/ui";
import { useToast } from "../../components/Toast";
import { SwipeToDelete } from "../../components/mobile/SwipeToDelete";

interface Note { id: string; type: string; title: string; message: string; transactionId?: string | null; readAt?: string | null; createdAt: string }
type Tab = "all" | "notices" | "updates";

/** Notices come from the librarian (overdue, due-soon reminders); updates are about the member's requests and returns. */
const NOTICE_TYPES = new Set(["OVERDUE", "DUE_SOON"]);

const look: Record<string, { Icon: typeof CheckCircle2; cls: string }> = {
  OVERDUE: { Icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
  DUE_SOON: { Icon: AlarmClock, cls: "bg-warning-soft text-warning" },
  REQUEST_APPROVED: { Icon: CheckCircle2, cls: "bg-success-soft text-success" },
  REQUEST_REJECTED: { Icon: XCircle, cls: "bg-slate-100 text-ink-muted" },
  RETURN_RECORDED: { Icon: BookCheck, cls: "bg-primary-soft text-primary" },
  BOOK_BORROWED: { Icon: CheckCircle2, cls: "bg-success-soft text-success" },
  SUGGESTION_UPDATE: { Icon: Lightbulb, cls: "bg-accent-soft text-on-accent" },
  BOOK_AVAILABLE: { Icon: BookCheck, cls: "bg-success-soft text-success" },
};

/** "Just now", "5 min ago", "3 h ago", "Yesterday", or a date. */
export function timeAgo(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (new Date(iso).toDateString() === new Date(now).toDateString()) return `${Math.floor(min / 60)} h ago`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (new Date(iso).toDateString() === y.toDateString()) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Today / Yesterday / Earlier buckets, in order, empty ones dropped. */
export function groupByDay<T extends { createdAt: string }>(items: T[], now = Date.now()) {
  const today = new Date(now).toDateString();
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = y.toDateString();
  const groups: { label: string; items: T[] }[] = [{ label: "Today", items: [] }, { label: "Yesterday", items: [] }, { label: "Earlier", items: [] }];
  for (const n of items) {
    const d = new Date(n.createdAt).toDateString();
    groups[d === today ? 0 : d === yesterday ? 1 : 2]!.items.push(n);
  }
  return groups.filter(g => g.items.length);
}

export function MobileNotifications() {
  const auth = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab: Tab = picked ?? "all";
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!auth.token) return;
    setLoading(true);
    setError("");
    mobileApi("/api/v1/notifications/mine", { token: auth.token }).then(r => {
      if (r.ok) setItems((r.data as { items: Note[] }).items);
      else setError(r.message ?? "Could not load your alerts.");
      setLoading(false);
    });
  }, [auth.token]);

  useEffect(() => { load(); }, [load]);

  const unread = items.filter(n => !n.readAt).length;
  const notices = items.filter(n => NOTICE_TYPES.has(n.type));
  const updates = items.filter(n => !NOTICE_TYPES.has(n.type));
  const shown = tab === "notices" ? notices : tab === "updates" ? updates : items;
  const tabs: TabDef<Tab>[] = [
    { key: "all", label: "All", icon: Inbox, count: items.length },
    { key: "notices", label: "Notices", icon: Megaphone, count: notices.length },
    { key: "updates", label: "Updates", icon: BellRing, count: updates.length },
  ];
  const groups = groupByDay(shown, now);
  const direction = useSlideDirection(tabs.findIndex(t => t.key === tab));

  const markAll = async () => {
    const r = await mobileApi("/api/v1/notifications/read-all", { method: "POST", body: "{}", token: auth.token });
    if (r.ok) {
      setItems(xs => xs.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      toast({ tone: "success", title: "All caught up", message: "Every alert is marked as read." });
    }
  };

  const open = (n: Note) => {
    if (!n.readAt) {
      setItems(xs => xs.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      mobileApi(`/api/v1/notifications/${n.id}/read`, { method: "POST", body: "{}", token: auth.token });
    }
    if (n.transactionId) nav(`/m/receipt/${n.transactionId}`);
  };

  const remove = async (n: Note) => {
    setItems(xs => xs.filter(x => x.id !== n.id));
    const r = await mobileApi(`/api/v1/notifications/${n.id}`, { method: "DELETE", token: auth.token });
    if (!r.ok) { toast({ tone: "error", title: "Could not delete", message: r.message ?? "Please try again." }); load(); }
  };

  const card = (n: Note) => {
    const { Icon, cls } = look[n.type] ?? look.RETURN_RECORDED!;
    const isNotice = NOTICE_TYPES.has(n.type);
    return (
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={`relative w-full text-left flex gap-3 p-4 pl-5 rounded-3xl border shadow-sm overflow-hidden transition active:scale-[0.99] ${focusRing} ${n.readAt ? "bg-surface border-line" : "bg-primary-soft/60 border-primary/30"}`}
                      >
                        {!n.readAt && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" aria-hidden="true" />}
                        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${cls}`} aria-hidden="true"><Icon size={22} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`text-sm text-ink ${n.readAt ? "font-semibold" : "font-bold"}`}>{n.title}</span>
                            <span className="text-xs text-ink-muted shrink-0 mt-0.5">{timeAgo(n.createdAt, now)}</span>
                          </span>
                          <span className="block text-sm text-ink-muted mt-1">{n.message}</span>
                          <span className="flex flex-wrap items-center gap-2 mt-2">
                            {isNotice && <span className={`text-[11px] font-semibold px-3 py-1 leading-tight rounded-full ${cls}`}>From the librarian</span>}
                            {n.transactionId && <span className="text-xs font-semibold text-primary">View receipt ›</span>}
                            {!n.readAt && <span className="sr-only">Unread.</span>}
                          </span>
                        </span>
                      </button>
    );
  };

  const summary = (
    <section aria-label="Alerts summary" className="bg-surface rounded-3xl border border-line shadow-lg p-4 flex items-center gap-4">
      <span className={`relative w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${unread ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary" : "bg-success-soft text-success"}`} aria-hidden="true">
        {unread ? <Bell size={26} /> : <CheckCheck size={26} />}
        {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1 rounded-full bg-danger text-on-primary text-xs font-bold flex items-center justify-center ring-2 ring-surface">{unread > 9 ? "9+" : unread}</span>}
      </span>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-semibold text-ink">{unread ? `${unread} unread alert${unread === 1 ? "" : "s"}` : "You're all caught up"}</p>
        <p className="text-ink-muted">Library notices and request updates.</p>
      </div>
      {unread > 0 && <button type="button" onClick={markAll} className={`shrink-0 px-3 min-h-10 rounded-full bg-primary-soft text-primary text-xs font-semibold ${focusRing}`}>Mark all read</button>}
    </section>
  );

  const emptyText = {
    all: "No alerts yet. You'll see the librarian's notices and updates on your requests here.",
    notices: "No notices from the librarian. Overdue notices and return reminders will show up here.",
    updates: "No updates yet. Approvals, declines and returns will show up here.",
  }[tab];

  return (
    <ScreenShell title="Alerts" subtitle="Library notices and updates on your requests" icon={Bell} floating={summary}>
      <ListState loading={loading && "Loading your alerts…"} error={error} onRetry={load}>
        <div className="space-y-6">
        <SlidingTabs label="Alert types" tabs={tabs} active={tab} onChange={setPicked} />
        {/* Slide only when the member switches tabs, so the first view appears together with the tabs. */}
        <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={`space-y-5 ${picked ? direction : ""}`}>
          {shown.length === 0 ? (
            <div className="text-center py-10 px-4 bg-surface rounded-3xl border border-line">
              <span className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mx-auto mb-3" aria-hidden="true"><Bell size={28} /></span>
              <p className="text-ink font-medium">{emptyText}</p>
            </div>
          ) : groups.map(g => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2 px-1">{g.label}</h2>
              <ul className="space-y-3">
                {g.items.map(n => {
                  return (
                    <li key={n.id}>
                      {tab === "updates" ? <SwipeToDelete label={n.title} onDelete={() => remove(n)}>{card(n)}</SwipeToDelete> : card(n)}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        </div>
      </ListState>
    </ScreenShell>
  );
}
