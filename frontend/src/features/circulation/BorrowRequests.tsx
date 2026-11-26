import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, X, Receipt, ClipboardList, BookOpen, UserRound } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { ReceiptDialog } from "./ReceiptDialog";
import { RefreshButton } from "../../components/RefreshButton";
import { Badge, EmptyState, SearchField, Segmented, Skeleton, btn, btnSm, input, matches, select, table } from "../../components/staff/ui";
import { phDateTime } from "../../lib/dates";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
interface Req {
  id: string; status: Status; createdAt: string; updatedAt?: string; reviewedAt?: string | null; decisionNote?: string | null; availableCopies: number;
  book: { title: string; authors?: string | null };
  member: { username: string; displayName?: string | null; memberType?: string | null; maskedId?: string | null };
  reviewedBy?: { username: string; displayName?: string | null } | null;
  transaction?: { id: string; receiptNo?: string | null; dueAt?: string | null } | null;
}

const tabs: { key: Status; label: string }[] = [
  { key: "PENDING", label: "Pending" }, { key: "APPROVED", label: "Approved" }, { key: "REJECTED", label: "Declined" }, { key: "CANCELLED", label: "Cancelled" },
];

/** Borrowing > Borrow Requests: approve (lends a copy and issues a receipt) or decline member requests. */
export function BorrowRequests() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Status>("PENDING");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const canWrite = hasPerm("circulation:write");
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  useEffect(() => { const v = params.get("q"); if (v !== null) setQ(v); }, [params]); // global search opening this page again
  const [who, setWho] = useState<"" | "Student" | "Teacher">("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["borrow-requests", tab],
    queryFn: async () => { const r = await apiFetch(`/api/v1/borrow-requests?status=${tab}`, { token }); if (!r.ok) throw new Error(r.message); return (r.data as { items: Req[] }).items; },
    enabled: !!token,
  });

  const act = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) => {
      const r = await apiFetch(`/api/v1/borrow-requests/${id}/${action}`, { method: "POST", body: JSON.stringify(note ? { note } : {}), token });
      if (!r.ok) throw new Error(r.message ?? "Action failed");
      return { action, req: r.data as Req };
    },
    onSuccess: ({ action, req }) => {
      toast(action === "approve"
        ? { tone: "success", title: "Request approved", message: `Receipt ${req.transaction?.receiptNo ?? ""} created; the member was notified.` }
        : { tone: "info", title: "Request declined", message: "The member was notified." });
      if (action === "approve" && req.transaction) setReceiptId(req.transaction.id);
      setRejecting(null); setReason("");
      ["borrow-requests", "loans", "summary", "catalog", "copies-summary", "recent-activity"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast({ tone: "error", title: "Action failed", message: (e as Error).message }),
  });

  const rows = data?.filter(r => (!who || r.member.memberType === who) && matches(q, r.member.displayName, r.member.username, r.book.title, r.book.authors, r.transaction?.receiptNo, r.decisionNote));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Request status" value={tab} onChange={t => { setTab(t); setRejecting(null); }} options={tabs.map(t => ({ ...t, count: t.key === tab ? data?.length : undefined }))} />
        <RefreshButton what="borrow requests" onRefresh={refetch} />
      </div>
      <p className="text-sm text-ink-muted">Review member requests. Approving lends an available copy for 7 days and issues a receipt.</p>
      <div className="flex flex-wrap items-start gap-3">
        <SearchField id="requests-search" label="Search borrow requests" value={q} onChange={setQ} placeholder="Search member, book, author or receipt no." shown={rows?.length} total={data?.length} />
        <label htmlFor="requests-who" className="sr-only">Member type</label>
        <select id="requests-who" value={who} onChange={e => setWho(e.target.value as typeof who)} className={`${select} !w-auto !rounded-full`}><option value="">Students and teachers</option><option value="Student">Students only</option><option value="Teacher">Teachers only</option></select>
      </div>

      {isLoading && <Skeleton rows={4} />}
      {isError && <p role="alert" className="text-danger">Could not load requests. <button className="underline" onClick={() => refetch()}>Try again</button></p>}
      {data && data.length === 0 && <EmptyState icon={ClipboardList} text={`No ${tabs.find(t => t.key === tab)?.label.toLowerCase()} requests.`} />}

      {data && data.length > 0 && rows?.length === 0 && <EmptyState icon={ClipboardList} text="No requests match your search or filter." />}
      {rows && rows.length > 0 && (
        <div key={tab} className={`${table.wrap}`}>
          <table className={table.table}>
            <thead className={table.head}>
              <tr><th className={table.th}>Member</th><th className={table.th}>Book</th><th className={table.th}>Requested</th><th className={table.th}>{tab === "PENDING" ? "Available copies" : "Decision"}</th><th className={`${table.th} text-right`}>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={table.row}>
                  <td className={table.td}><div className="font-semibold text-ink">{r.member.displayName || r.member.username}</div><div className="text-xs text-ink-muted">{r.member.username}{r.member.memberType ? ` · ${r.member.memberType}` : ""}</div></td>
                  <td className={table.td}><div className="font-semibold text-ink">{r.book.title}</div><div className="text-xs text-ink-muted">{r.book.authors}</div></td>
                  <td className={`${table.td} text-ink-muted`}>{phDateTime(r.createdAt)}</td>
                  <td className={`${table.td} text-ink-muted`}>
                    {tab === "PENDING"
                      ? <Badge tone={r.availableCopies > 0 ? "success" : "danger"}>{r.availableCopies} available</Badge>
                      : <Decision r={r} />}
                  </td>
                  <td className={table.td}>
                    <div className="flex justify-end gap-2">
                      {tab === "PENDING" && canWrite && rejecting !== r.id && (
                        <>
                          <button className={`${btn.success} ${btnSm}`} disabled={act.isPending || r.availableCopies === 0} onClick={() => act.mutate({ id: r.id, action: "approve" })}><Check size={14} aria-hidden="true" />Approve</button>
                          <button className={`${btn.secondary} ${btnSm}`} disabled={act.isPending} onClick={() => { setRejecting(r.id); setReason(""); }}><X size={14} aria-hidden="true" />Decline</button>
                        </>
                      )}
                      {rejecting === r.id && (
                        <form className="flex flex-wrap gap-2 justify-end ak-fade" onSubmit={e => { e.preventDefault(); act.mutate({ id: r.id, action: "reject", note: reason.trim() || undefined }); }}>
                          <label className="sr-only" htmlFor={`reason-${r.id}`}>Reason for declining</label>
                          <input id={`reason-${r.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={190} placeholder="Reason (optional)" className={`${input} !min-h-9 !py-1 !rounded-xl !w-56`} autoFocus />
                          <button type="submit" className={`${btn.danger} ${btnSm}`} disabled={act.isPending}>Decline</button>
                          <button type="button" className={`${btn.ghost} ${btnSm}`} onClick={() => setRejecting(null)}>Cancel</button>
                        </form>
                      )}
                      {r.transaction && <button className={`${btn.secondary} ${btnSm}`} onClick={() => setReceiptId(r.transaction!.id)}><Receipt size={14} aria-hidden="true" />Receipt</button>}
                      {tab !== "PENDING" && <Link to={`/catalog?q=${encodeURIComponent(r.book.title)}`} className={`${btn.secondary} ${btnSm}`}><BookOpen size={14} aria-hidden="true" />Book</Link>}
                      {tab !== "PENDING" && <Link to={`/members?q=${encodeURIComponent(r.member.maskedId || r.member.username)}`} className={`${btn.secondary} ${btnSm}`}><UserRound size={14} aria-hidden="true" />Member</Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReceiptDialog transactionId={receiptId} onClose={() => setReceiptId(null)} />
    </div>
  );
}

/** What happened to a request that is no longer pending: who decided, when, and why. */
function Decision({ r }: { r: Req }) {
  const by = r.reviewedBy ? r.reviewedBy.displayName || r.reviewedBy.username : null;
  if (r.status === "CANCELLED") return <div><Badge tone="muted">Cancelled by the member</Badge><div className="text-xs mt-1">{phDateTime(r.updatedAt ?? r.createdAt)}</div></div>;
  if (r.status === "REJECTED") return (
    <div>
      <Badge tone="danger">Declined</Badge>
      <div className="text-xs mt-1">{by ? `By ${by}` : "By the librarian"}{r.reviewedAt ? ` · ${phDateTime(r.reviewedAt)}` : ""}</div>
      <div className="text-xs italic">{r.decisionNote ? `“${r.decisionNote}”` : "No reason given"}</div>
    </div>
  );
  return (
    <div>
      <Badge tone="success">Approved</Badge>
      <div className="text-xs mt-1">{by ? `By ${by}` : "By the librarian"}{r.reviewedAt ? ` · ${phDateTime(r.reviewedAt)}` : ""}</div>
      {r.transaction?.receiptNo && <div className="font-mono text-xs">{r.transaction.receiptNo}{r.transaction.dueAt ? ` · due ${phDateTime(r.transaction.dueAt)}` : ""}</div>}
      {r.decisionNote && <div className="text-xs italic">“{r.decisionNote}”</div>}
    </div>
  );
}
