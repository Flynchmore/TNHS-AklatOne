import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Heart, Library, Hourglass, Receipt as ReceiptIcon, XCircle, BookCheck, ClipboardList, History as HistoryIcon, BookOpen, CalendarClock } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { BookCover, ListState, ScreenShell, SlidingTabs, focusRing, loanStatus, mobileApi, useSlideDirection } from "../../components/mobile/ui";
import { useToast } from "../../components/Toast";
import { SwipeToDelete } from "../../components/mobile/SwipeToDelete";
import { FavouritesPanel, type FavData } from "./FavouritesPanel";
import type { TabDef } from "../../components/mobile/ui";

interface Req {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  decisionNote?: string | null;
  book: { id: string; title: string; authors?: string | null; isbn?: string | null; coverUrl?: string | null; };
  transaction?: { id: string; receiptNo?: string | null; dueAt?: string | null; status: string; outcome?: string | null; returnedAt?: string | null } | null;
}
type Tab = "borrowed" | "requests" | "favourites" | "past";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

/** "Due in 5 days" / "Due tomorrow" / "Due today" / "Overdue by 2 days", with a matching colour. */
export function dueChip(dueAt: string | null | undefined, now = Date.now()) {
  if (!dueAt) return { text: "No due date", cls: "bg-slate-100 text-ink-muted" };
  const day = 86400000;
  const startOf = (t: number) => new Date(new Date(t).toDateString()).getTime();
  const days = Math.round((startOf(new Date(dueAt).getTime()) - startOf(now)) / day);
  if (new Date(dueAt).getTime() < now) return { text: `Overdue by ${Math.max(1, -days)} day${Math.max(1, -days) === 1 ? "" : "s"}`, cls: "bg-danger-soft text-danger" };
  if (days <= 0) return { text: "Due today", cls: "bg-warning-soft text-warning" };
  if (days === 1) return { text: "Due tomorrow", cls: "bg-warning-soft text-warning" };
  return { text: `Due in ${days} days`, cls: "bg-primary-soft text-primary" };
}

export function MobileLoans() {
  const auth = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Req[]>([]);
  const [policy, setPolicy] = useState<{ loanDays: number; maxBooks: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [favs, setFavs] = useState<FavData>({ items: [], folders: [] });

  const load = useCallback(() => {
    if (!auth.token) return;
    setLoading(true);
    setError("");
    // Wait for both so the tab counts and the list appear together.
    Promise.all([
      mobileApi("/api/v1/favourites/mine", { token: auth.token }),
      mobileApi("/api/v1/borrow-requests/mine", { token: auth.token }),
      mobileApi("/api/v1/circulation/transactions?limit=100", { token: auth.token }),
    ]).then(([f, r, t]) => {
      if (f.ok && f.data) setFavs(f.data as FavData);
      if (r.ok) {
        const data = r.data as { items: Req[]; policy: { loanDays: number; maxBooks: number } };
        // Books lent at the library desk have no request: add them to Borrowed so the count matches the server's limit.
        const viaRequest = new Set(data.items.map(i => i.transaction?.id).filter(Boolean));
        type DeskTx = { id: string; status: string; receiptNo?: string | null; dueAt?: string | null; borrowedAt: string; bookCopy: { book: Req["book"] } };
        const desk = t.ok ? ((t.data as { items: DeskTx[] }).items ?? []).filter(x => x.status === "ACTIVE" && !viaRequest.has(x.id)) : [];
        setItems([...desk.map((x): Req => ({ id: `desk-${x.id}`, status: "APPROVED", createdAt: x.borrowedAt, book: x.bookCopy.book, transaction: { id: x.id, receiptNo: x.receiptNo, dueAt: x.dueAt, status: "ACTIVE" } })), ...data.items]);
        setPolicy(data.policy);
      } else setError(r.message ?? "Could not load your books.");
      setLoading(false);
    });
  }, [auth.token]);

  useEffect(() => { load(); }, [load]);

  const borrowed = items.filter(i => i.status === "APPROVED" && i.transaction?.status === "ACTIVE");
  const requests = items.filter(i => i.status === "PENDING");
  const past = items.filter(i => i.status === "REJECTED" || (i.status === "APPROVED" && i.transaction?.status !== "ACTIVE"));
  const used = borrowed.length + requests.length;
  // Open on the most relevant tab until the member picks one.
  const active: Tab = tab ?? (borrowed.length ? "borrowed" : requests.length ? "requests" : "past");

  const cancel = async (r: Req) => {
    setCancelling(r.id);
    const res = await mobileApi(`/api/v1/borrow-requests/${r.id}/cancel`, { method: "POST", body: "{}", token: auth.token });
    setCancelling(null);
    toast(res.ok ? { tone: "info", title: "Request cancelled", message: `"${r.book.title}" is free for other members.` } : { tone: "error", title: "Could not cancel", message: res.message ?? "Please try again." });
    load();
  };

  const tabs: TabDef<Tab>[] = [
    { key: "borrowed", label: "Borrowed", icon: BookCheck, count: borrowed.length },
    { key: "requests", label: "Requests", icon: ClipboardList, count: requests.length },
    { key: "favourites", label: "Favourites", icon: Heart, count: favs.items.length },
    { key: "past", label: "History", icon: HistoryIcon, count: past.length },
  ];
  const direction = useSlideDirection(tabs.findIndex(t => t.key === active));

  const empty = (text: string) => (
    <div className="text-center py-10 px-4 bg-surface rounded-3xl border border-line">
      <span className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mx-auto mb-3" aria-hidden="true"><BookOpen size={28} /></span>
      <p className="text-ink font-medium">{text}</p>
      <Link to="/m/catalog" className={`inline-flex items-center justify-center mt-4 px-5 min-h-11 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary text-sm font-semibold shadow-md ${focusRing}`}>Browse the catalog</Link>
    </div>
  );

  const hide = async (r: Req) => {
    setItems(xs => xs.filter(x => x.id !== r.id));
    const res = await mobileApi(`/api/v1/borrow-requests/${r.id}/hide`, { method: "POST", body: "{}", token: auth.token });
    if (!res.ok) { toast({ tone: "error", title: "Could not remove", message: res.message ?? "Please try again." }); load(); }
  };

  const cardBody = (i: Req, body: React.ReactNode, padTitle = false) => (
    <div className="bg-surface rounded-3xl border border-line shadow-sm p-3 flex gap-3">
      <BookCover isbn={i.book.isbn} coverUrl={i.book.coverUrl} title={i.book.title} className="w-16 h-24 rounded-xl shrink-0 shadow-sm" />
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className={`text-sm font-semibold text-ink line-clamp-2 ${padTitle ? "pr-8" : ""}`}>{i.book.title}</h3>
        <p className="text-xs text-ink-muted line-clamp-1">{i.book.authors || "Unknown author"}</p>
        {body}
      </div>
    </div>
  );
  const card = (i: Req, body: React.ReactNode) => (
    <li key={i.id}>{cardBody(i, body)}</li>
  );

  const summary = policy && (
    <section aria-label="Borrowing limit" className="bg-surface rounded-3xl border border-line shadow-lg p-4 flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0" aria-hidden="true">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-primary-soft" strokeWidth="4" />
          <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-primary motion-safe:transition-all motion-safe:duration-700" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(Math.min(used, policy.maxBooks) / policy.maxBooks) * 97.4} 97.4`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-primary-strong">{used}/{policy.maxBooks}</span>
      </div>
      <div className="text-sm min-w-0">
        <p className="font-semibold text-ink">{used >= policy.maxBooks ? "You've reached your limit" : `${policy.maxBooks - used} more book${policy.maxBooks - used === 1 ? "" : "s"} available to you`}</p>
        <p className="text-ink-muted flex items-center gap-1 mt-0.5"><CalendarClock size={14} aria-hidden="true" />Borrow each book for {policy.loanDays} days</p>
      </div>
    </section>
  );

  return (
    <ScreenShell title="My Books" subtitle="Borrowed books, requests, favourites and history" icon={Library} floating={summary}>
      <ListState loading={loading && "Loading your books…"} error={error} onRetry={load}>
        <div className="space-y-6">
        <SlidingTabs label="My books" tabs={tabs} active={active} onChange={setTab} columns={2} />

        {/* Slide only when the member switches tabs, so the first view appears together with the tabs. */}
        <div key={active} id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`} className={tab ? direction : ""}>
          {active === "borrowed" && (borrowed.length === 0 ? empty("No borrowed books right now.") : (
            <ul className="space-y-3">
              {borrowed.map(i => {
                const due = dueChip(i.transaction?.dueAt, now);
                return card(i, (
                  <>
                    <span className={`self-start mt-2 text-xs font-semibold px-3 py-1 leading-tight rounded-full ${due.cls}`}>{due.text}</span>
                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-muted">Return by {fmt(i.transaction?.dueAt)}</span>
                      <Link to={`/m/receipt/${i.transaction!.id}`} className={`inline-flex items-center gap-1 px-3 min-h-9 rounded-full bg-primary-soft text-primary text-xs font-semibold ${focusRing}`}><ReceiptIcon size={14} aria-hidden="true" />Receipt</Link>
                    </div>
                  </>
                ));
              })}
            </ul>
          ))}

          {active === "requests" && (requests.length === 0 ? empty("No requests waiting. Find a book and tap Request to borrow.") : (
            <ul className="space-y-3">
              {requests.map(i => card(i, (
                <>
                  <span className="self-start mt-2 text-xs font-semibold px-3 py-1 leading-tight rounded-full bg-warning-soft text-warning inline-flex items-center gap-1"><Hourglass size={12} aria-hidden="true" />Waiting for librarian</span>
                  <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-muted">Requested {fmt(i.createdAt)}</span>
                    <button type="button" onClick={() => cancel(i)} disabled={cancelling === i.id} className={`px-3 min-h-9 rounded-full border border-danger/40 text-danger text-xs font-semibold disabled:opacity-60 ${focusRing}`}>{cancelling === i.id ? "Cancelling…" : "Cancel"}</button>
                  </div>
                </>
              )))}
            </ul>
          ))}

          {active === "favourites" && <FavouritesPanel data={favs} onChange={setFavs} />}

          {active === "past" && (past.length === 0 ? empty("No history yet. Returned books and past requests will show up here.") : (
            <ul className="space-y-3">
              {past.map(i => {
                const st = i.status === "REJECTED" ? { text: "Declined", cls: "bg-slate-100 text-ink-muted" } : loanStatus(i.transaction!, now);
                return <li key={i.id}><SwipeToDelete label={i.book.title} onDelete={() => hide(i)} buttonAt="top-2 right-2">{cardBody(i, (
                  <>
                    <span className={`self-start mt-2 text-xs font-semibold px-3 py-1 leading-tight rounded-full inline-flex items-center gap-1 ${st.cls}`}>{i.status === "REJECTED" && <XCircle size={12} aria-hidden="true" />}{st.text}</span>
                    {i.decisionNote && <p className="text-xs text-ink-muted mt-1.5">Reason: {i.decisionNote}</p>}
                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-ink-muted">{i.transaction?.returnedAt ? `Returned ${fmt(i.transaction.returnedAt)}` : `Requested ${fmt(i.createdAt)}`}</span>
                      {i.transaction && <Link to={`/m/receipt/${i.transaction.id}`} className={`inline-flex items-center gap-1 px-3 min-h-9 rounded-full bg-primary-soft text-primary text-xs font-semibold ${focusRing}`}><ReceiptIcon size={14} aria-hidden="true" />Receipt</Link>}
                    </div>
                  </>
                ), true)}</SwipeToDelete></li>;
              })}
            </ul>
          ))}
        </div>
        </div>
      </ListState>
    </ScreenShell>
  );
}
