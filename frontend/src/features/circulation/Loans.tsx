import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Undo2, AlarmClock, Send, Receipt, BookCheck } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { loanStatus } from "../../components/mobile/ui";
import { ReceiptDialog } from "./ReceiptDialog";
import { RefreshButton } from "../../components/RefreshButton";
import { useToast } from "../../components/Toast";
import { EmptyState, SearchField, Segmented, Skeleton, StaffDialog, btn, btnSm, input, label, matches, table, select } from "../../components/staff/ui";
import { phDate } from "../../lib/dates";
import { queuedToast } from "../../lib/offline";

interface Loan {
  id: string; status: string; outcome?: string | null; receiptNo?: string | null; borrowedAt: string; dueAt?: string | null; returnedAt?: string | null;
  bookCopy?: { barcode?: string; book?: { title: string; isbn?: string | null } };
  borrower?: { username: string; displayName?: string | null; maskedId?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null };
}
type Outcome = "RETURNED_ON_TIME" | "RETURNED_LATE" | "DAMAGED" | "MISSING";
const outcomes: { value: Outcome; label: string }[] = [
  { value: "RETURNED_ON_TIME", label: "Returned on time" },
  { value: "RETURNED_LATE", label: "Returned late (overdue)" },
  { value: "DAMAGED", label: "Returned torn / damaged" },
  { value: "MISSING", label: "Missing (not returned)" },
];
const fmt = phDate;

/** Borrowing > Borrowed Books: books that are out, return outcomes, and notices to members. */
export function Loans() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"ACTIVE" | "CLOSED">("ACTIVE");
  const [returning, setReturning] = useState<{ id: string; outcome: Outcome } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const canWrite = hasPerm("circulation:write");
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  useEffect(() => { const v = params.get("q"); if (v !== null) setQ(v); }, [params]); // global search opening this page again
  const [show, setShow] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["loans", view],
    refetchInterval: 30_000,
    queryFn: async () => {
      const statuses = view === "ACTIVE" ? ["ACTIVE"] : ["RETURNED", "LOST"];
      const lists = await Promise.all(statuses.map(async s => {
        const r = await apiFetch(`/api/v1/circulation/transactions?status=${s}&limit=100`, { token });
        if (!r.ok) throw new Error(r.message);
        return (r.data as { items: Loan[] }).items;
      }));
      return lists.flat();
    },
    enabled: !!token,
  });

  const [notice, setNotice] = useState<{ loan: Loan; kind: NoticeKind } | null>(null);

  const ret = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: Outcome }) => {
      const loan = data?.find(l => l.id === id);
      const r = await apiFetch("/api/v1/circulation/return", { method: "POST", body: JSON.stringify({ transactionId: id, outcome }), token, offline: { kind: "return", label: `Return "${loan?.bookCopy?.book?.title ?? "book"}" from ${loan?.borrower?.maskedId || "member"}` } });
      if (!r.ok) throw new Error(r.message ?? "Could not record the return");
      return { outcome, queued: r.queued };
    },
    onSuccess: ({ outcome, queued }) => {
      toast(queued ? queuedToast : { tone: "success", title: "Return recorded", message: `${outcomes.find(o => o.value === outcome)?.label}. The member was notified.` });
      setReturning(null);
      ["loans", "summary", "copies-summary", "catalog"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast({ tone: "error", title: "Return not saved", message: (e as Error).message }),
  });

  const isOverdue = (l: Loan) => l.status === "ACTIVE" && !!l.dueAt && new Date(l.dueAt).getTime() < now;

  const keep = (l: Loan) => !show || (show === "overdue" ? isOverdue(l) : show === "ontime" ? !isOverdue(l) : l.status === show);
  const rows = data?.filter(l => keep(l) && matches(q, l.bookCopy?.book?.title, l.bookCopy?.book?.isbn, l.bookCopy?.barcode, l.borrower?.maskedId, l.borrower?.gradeSection, l.borrower?.displayName, l.borrower?.username, l.receiptNo));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Borrowed books view" value={view} onChange={v => { setView(v); setReturning(null); setShow(""); }} options={[{ key: "ACTIVE", label: "Borrowed now" }, { key: "CLOSED", label: "Returned" }]} />
        <RefreshButton what="borrowed books" onRefresh={refetch} />
      </div>
      <p className="text-sm text-ink-muted">Books currently borrowed. When a book comes back, record how it was returned.</p>
      <div className="flex flex-wrap items-start gap-3">
        <SearchField id="loans-search" label="Search borrowed books" value={q} onChange={setQ} placeholder="Search book, ISBN, copy code, Member ID or receipt no." shown={rows?.length} total={data?.length} />
        <label htmlFor="loans-show" className="sr-only">Show</label>
        <select id="loans-show" value={show} onChange={e => setShow(e.target.value)} className={`${select} !w-auto !rounded-full`}>
          {view === "ACTIVE"
            ? <><option value="">All borrowed books</option><option value="overdue">Overdue only</option><option value="ontime">Not overdue</option></>
            : <><option value="">Returned and lost</option><option value="RETURNED">Returned only</option><option value="LOST">Lost only</option></>}
        </select>
      </div>

      {isLoading && <Skeleton rows={4} />}
      {isError && <p role="alert" className="text-danger">Could not load borrowed books. <button className="underline" onClick={() => refetch()}>Try again</button></p>}
      {data && data.length === 0 && <EmptyState icon={BookCheck} text={view === "ACTIVE" ? "No books are borrowed right now." : "No returned books yet."} />}

      {data && data.length > 0 && rows?.length === 0 && <EmptyState icon={BookCheck} text="No borrowed books match your search or filter." />}
      {rows && rows.length > 0 && (
        <div key={view} className={`${table.wrap}`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr>{["Book", "Member ID", "Borrowed", "Due", "Status"].map(h => <th key={h} className={table.th}>{h}</th>)}<th className={`${table.th} text-right`}>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map(l => {
                const st = loanStatus(l, now);
                return (
                  <tr key={l.id} className={table.row}>
                    <td className={table.td}><div className="font-semibold text-ink">{l.bookCopy?.book?.title}</div><div className="text-xs text-ink-muted font-mono">ISBN {l.bookCopy?.book?.isbn || "N/A"}</div></td>
                    <td className={table.td}><div className="font-mono font-bold text-primary-strong">{l.borrower?.maskedId ?? "—"}</div><div className="text-xs text-ink-muted">{(l.borrower?.memberType === "Teacher" ? l.borrower?.department : l.borrower?.gradeSection) ?? ""}</div></td>
                    <td className={`${table.td} text-ink-muted`}>{fmt(l.borrowedAt)}</td>
                    <td className={`${table.td} ${isOverdue(l) ? "text-danger font-semibold" : "text-ink-muted"}`}>{fmt(l.dueAt)}</td>
                    <td className={table.td}><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${st.cls}`}>{st.text}</span></td>
                    <td className={table.td}>
                      <div className="flex flex-wrap justify-end gap-2">
                        {view === "ACTIVE" && canWrite && returning?.id !== l.id && (
                          <>
                            {isOverdue(l)
                              ? <button className={`${btn.danger} ${btnSm}`} onClick={() => setNotice({ loan: l, kind: "OVERDUE" })}><Bell size={14} aria-hidden="true" />Overdue notice</button>
                              : <button className={`${btn.secondary} ${btnSm}`} onClick={() => setNotice({ loan: l, kind: "DUE_SOON" })}><AlarmClock size={14} aria-hidden="true" />Send reminder</button>}
                            <button className={`${btn.primary} ${btnSm}`} onClick={() => setReturning({ id: l.id, outcome: isOverdue(l) ? "RETURNED_LATE" : "RETURNED_ON_TIME" })}><Undo2 size={14} aria-hidden="true" />Record return</button>
                          </>
                        )}
                        {returning?.id === l.id && (
                          <form className="flex flex-wrap gap-2 justify-end ak-fade" onSubmit={e => { e.preventDefault(); ret.mutate(returning); }}>
                            <label className="sr-only" htmlFor={`outcome-${l.id}`}>Return outcome</label>
                            <select id={`outcome-${l.id}`} value={returning.outcome} onChange={e => setReturning({ id: l.id, outcome: e.target.value as Outcome })} className={`${select} !min-h-9 !py-1 !rounded-xl !w-auto`} autoFocus>
                              {outcomes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button type="submit" className={`${btn.primary} ${btnSm}`} disabled={ret.isPending}>Save</button>
                            <button type="button" className={`${btn.ghost} ${btnSm}`} onClick={() => setReturning(null)}>Cancel</button>
                          </form>
                        )}
                        <button className={`${btn.secondary} ${btnSm}`} onClick={() => setReceiptId(l.id)}><Receipt size={14} aria-hidden="true" />Receipt</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ReceiptDialog transactionId={receiptId} onClose={() => setReceiptId(null)} />
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}

type NoticeKind = "OVERDUE" | "DUE_SOON";

/** Default wording; the librarian can edit it before sending. Mirrors the backend default. */
function defaultNotice(l: Loan, kind: NoticeKind) {
  const title = l.bookCopy?.book?.title ?? "your book";
  const due = l.dueAt ? phDate(l.dueAt) : "the due date";
  return kind === "OVERDUE"
    ? `"${title}" was due on ${due}. Please return it to the library as soon as possible.`
    : `Reminder: "${title}" is due on ${due}. Please return it to the library on or before that day.`;
}

/** Compose and send an overdue notice or an advance return reminder to the member's Alerts (and email). */
function NoticeDialog({ notice, onClose }: { notice: { loan: Loan; kind: NoticeKind } | null; onClose: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (notice) setMessage(defaultNotice(notice.loan, notice.kind)); }, [notice]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notice) return;
    setSending(true);
    const path = notice.kind === "OVERDUE" ? "/api/v1/notifications/overdue" : "/api/v1/notifications/reminder";
    const who = notice.loan.borrower?.maskedId || "the member";
    const r = await apiFetch(path, { method: "POST", body: JSON.stringify({ transactionId: notice.loan.id, message: message.trim() }), token, offline: { kind: "notice", label: `${notice.kind === "OVERDUE" ? "Overdue notice" : "Reminder"} to ${who}` } });
    setSending(false);
    if (!r.ok) { toast({ tone: "error", title: "Notice not sent", message: r.message ?? "Please try again." }); return; }
    if (r.queued) { toast(queuedToast); onClose(); return; }
    toast({ tone: "success", title: notice.kind === "OVERDUE" ? "Overdue notice sent" : "Reminder sent", message: `${notice.loan.borrower?.maskedId || "the member"} will see it in Alerts.` });
    onClose();
  };

  const overdue = notice?.kind === "OVERDUE";
  return (
    <StaffDialog open={!!notice} onClose={onClose} title={overdue ? "Send overdue notice" : "Send return reminder"} subtitle={notice ? `To ${notice.loan.borrower?.maskedId || "the member"}` : undefined} icon={overdue ? Bell : AlarmClock} tone={overdue ? "danger" : "warning"} onSubmit={send}
      footer={<>
        <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
        <button type="submit" disabled={sending || !message.trim()} className={overdue ? btn.danger : btn.primary}><Send size={15} aria-hidden="true" />{sending ? "Sending…" : "Send"}</button>
      </>}
    >
      {notice && (
        <>
          <div className={`flex items-center gap-3 p-3 rounded-2xl ${overdue ? "bg-danger-soft" : "bg-warning-soft"}`}>
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center bg-surface ${overdue ? "text-danger" : "text-warning"}`} aria-hidden="true">{overdue ? <Bell size={20} /> : <AlarmClock size={20} />}</span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink truncate">{notice.loan.borrower?.maskedId || "the member"} · {notice.loan.bookCopy?.book?.title}</p>
              <p className="text-ink-muted">Due {fmt(notice.loan.dueAt)}{overdue ? " — this book is overdue." : "."}</p>
            </div>
          </div>
          <div>
            <label htmlFor="notice-message" className={label}>Message to the member</label>
            <textarea id="notice-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} rows={4} className={`${input} resize-y`} />
            <p className="text-xs text-ink-muted text-right mt-1">{message.length}/500 · Also emailed when the member has an email.</p>
          </div>
        </>
      )}
    </StaffDialog>
  );
}
