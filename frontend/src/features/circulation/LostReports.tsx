import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileWarning, Download, Check, MessageSquareWarning } from "lucide-react";
import { apiFetch, apiUrl } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, EmptyState, Segmented, Skeleton, StaffDialog, btn, btnSm, card, input, label } from "../../components/staff/ui";
import { saveBlob } from "../../lib/download";
import { phDateTime } from "../../lib/dates";

type Status = "SUBMITTED" | "ACCEPTED" | "NEEDS_MORE";
interface Report { id: string; kind: string; message: string | null; fileName: string; mimeType: string; size: number; status: Status; note: string | null; createdAt: string; memberId: string | null; group: string | null; book: { title: string; copy: string; receiptNo: string | null; status: string; outcome: string | null } | null }
const STATUS: Record<Status, { label: string; tone: "warning" | "success" | "danger" }> = { SUBMITTED: { label: "New", tone: "warning" }, ACCEPTED: { label: "Accepted", tone: "success" }, NEEDS_MORE: { label: "Asked for more", tone: "danger" } };

/** Borrowing > Lost book reports: apology letters and reports members sent from the app (PDF, Word or photo). */
export function LostReports() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("SUBMITTED");
  const [asking, setAsking] = useState<Report | null>(null);
  const [note, setNote] = useState("");
  const list = useQuery({
    queryKey: ["lost-reports", status],
    queryFn: async () => { const r = await apiFetch(`/api/v1/lost-reports?status=${status}`, { token }); if (!r.ok) throw new Error(r.message); return r.data as { items: Report[]; waiting: number }; },
    enabled: !!token, refetchInterval: 60_000,
  });
  const download = async (r: Report) => {
    const res = await fetch(apiUrl(`/api/v1/lost-reports/${r.id}/file`), { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res?.ok) { toast({ tone: "error", title: "Could not download", message: "Please try again." }); return; }
    const where = await saveBlob(await res.blob(), r.fileName);
    toast({ tone: "success", title: "Document saved", message: `Saved to ${where}.` });
  };
  const review = async (r: Report, next: "ACCEPTED" | "NEEDS_MORE", text?: string) => {
    const res = await apiFetch(`/api/v1/lost-reports/${r.id}`, { method: "PATCH", token, body: JSON.stringify({ status: next, ...(text?.trim() ? { note: text.trim() } : {}) }) });
    if (!res.ok) { toast({ tone: "error", title: "Not saved", message: res.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: next === "ACCEPTED" ? "Document accepted" : "Asked for more", message: `${r.memberId ?? "The member"} was notified.` });
    setAsking(null); setNote("");
    void qc.invalidateQueries({ queryKey: ["lost-reports"] });
  };
  const canWrite = hasPerm("circulation:write");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Status> label="Report status" value={status} onChange={setStatus} options={[{ key: "SUBMITTED", label: "New", count: list.data?.waiting }, { key: "NEEDS_MORE", label: "Asked for more" }, { key: "ACCEPTED", label: "Accepted" }]} />
      </div>
      <p className="text-sm text-ink-muted">When a member loses a borrowed book, they send the apology letter or report you asked for from the app. Download it, then accept it or ask for more. Record the book as Missing in Borrowed Books.</p>
      {list.isLoading ? <Skeleton rows={3} /> : list.isError ? <p role="alert" className="text-danger">Could not load the reports.</p> : !list.data?.items.length ? <EmptyState icon={FileWarning} text={status === "SUBMITTED" ? "No new documents." : "Nothing here."} /> : (
        <ul className="grid lg:grid-cols-2 gap-4">
          {list.data.items.map(r => (
            <li key={r.id} className={`${card} p-5 space-y-2`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono font-bold text-primary-strong">{r.memberId ?? "—"} <span className="font-sans text-xs font-normal text-ink-muted">{r.group ?? ""}</span></p><p className="text-sm font-semibold text-ink">{r.book ? r.book.title : "Book not chosen"}{r.book?.receiptNo ? <span className="font-mono text-xs text-ink-muted"> · {r.book.receiptNo}</span> : null}</p></div>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
              <p className="text-xs text-ink-muted">{r.kind === "REPORT" ? "Report" : "Apology letter"} · {phDateTime(r.createdAt)} · {r.fileName} ({(r.size / 1024).toFixed(0)} KB)</p>
              {r.message && <p className="text-sm text-ink whitespace-pre-line rounded-xl bg-page px-3 py-2">{r.message}</p>}
              {r.note && <p className="text-sm text-ink"><b className="text-primary-strong">Your note:</b> {r.note}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => void download(r)} className={`${btn.secondary} ${btnSm}`}><Download size={14} aria-hidden="true" />Download</button>
                {canWrite && r.status !== "ACCEPTED" && <button type="button" onClick={() => void review(r, "ACCEPTED")} className={`${btn.success} ${btnSm}`}><Check size={14} aria-hidden="true" />Accept</button>}
                {canWrite && r.status !== "NEEDS_MORE" && <button type="button" onClick={() => { setAsking(r); setNote(""); }} className={`${btn.secondary} ${btnSm}`}><MessageSquareWarning size={14} aria-hidden="true" />Ask for more</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <StaffDialog open={!!asking} onClose={() => setAsking(null)} title="Ask for more" subtitle={asking ? `${asking.memberId ?? ""} · ${asking.fileName}` : undefined} icon={MessageSquareWarning} onSubmit={e => { e.preventDefault(); if (asking) void review(asking, "NEEDS_MORE", note); }}
        footer={<><button type="button" onClick={() => setAsking(null)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.primary}>Send to the member</button></>}>
        <div><label htmlFor="lr-note" className={label}>What else do you need?</label><input id="lr-note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="e.g. Please have it signed by your parent or guardian" className={input} /></div>
      </StaffDialog>
    </div>
  );
}
