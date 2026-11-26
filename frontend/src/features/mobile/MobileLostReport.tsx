import { useEffect, useState } from "react";
import { FileWarning, Upload, Download, FileText } from "lucide-react";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, ListState, ScreenShell, Spinner, btnPrimary, focusRing, mobileApi } from "../../components/mobile/ui";
import { apiUrl, appHeader } from "../../lib/api";
import { saveBlob } from "../../lib/download";
import { phDate } from "../../lib/dates";

interface Loan { id: string; status: string; bookCopy?: { book?: { title: string } }; receiptNo?: string | null }
interface Report { id: string; kind: string; message: string | null; fileName: string; size: number; status: "SUBMITTED" | "ACCEPTED" | "NEEDS_MORE"; note: string | null; createdAt: string; transactionId: string | null }
const ACCEPT = ".pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const STATUS: Record<Report["status"], { text: string; cls: string }> = {
  SUBMITTED: { text: "Sent, waiting for the librarian", cls: "bg-warning-soft text-warning" },
  ACCEPTED: { text: "Accepted by the librarian", cls: "bg-success-soft text-success" },
  NEEDS_MORE: { text: "The librarian needs more", cls: "bg-danger-soft text-danger" },
};

/**
 * Lost a borrowed book? Send the apology letter or report the librarian asked for (PDF, Word or a photo, up to 10 MB).
 * The librarian reads it in Borrowing > Lost book reports and answers here.
 */
export function MobileLostReport() {
  const { token } = useAuth();
  const toast = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ transactionId: "", kind: "APOLOGY", message: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const load = async () => {
    setError("");
    const [l, r] = await Promise.all([mobileApi("/api/v1/circulation/transactions?limit=100", { token }), mobileApi("/api/v1/lost-reports/mine", { token })]);
    if (l.ok) setLoans((l.data as { items: Loan[] }).items.filter(t => t.status === "ACTIVE" || t.status === "LOST"));
    if (r.ok) setReports((r.data as { items: Report[] }).items); else setError(r.message ?? "Could not load your documents.");
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [token]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!file) { setFormError("Choose the file to send (PDF, Word or a photo)."); return; }
    if (file.size > 10 * 1024 * 1024) { setFormError("The file is larger than 10 MB. Send a smaller one (for a photo, take it again at a lower size)."); return; }
    setBusy(true);
    const qs = new URLSearchParams({ kind: form.kind, name: file.name, ...(form.transactionId ? { transactionId: form.transactionId } : {}), ...(form.message.trim() ? { message: form.message.trim() } : {}) });
    const res = await fetch(apiUrl(`/api/v1/lost-reports?${qs}`), { method: "POST", headers: { ...appHeader, Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file }).catch(() => null);
    setBusy(false);
    if (!res) { setFormError("Can't reach the library server. Check your connection and try again."); return; }
    if (!res.ok) { const j = await res.json().catch(() => null) as { message?: string } | null; setFormError(j?.message ?? "Not sent. Please try again."); return; }
    toast({ tone: "success", title: "Document sent", message: "The librarian will read it and answer here." });
    setFile(null); setForm({ transactionId: "", kind: "APOLOGY", message: "" });
    void load();
  };
  const download = async (r: Report) => {
    const res = await fetch(apiUrl(`/api/v1/lost-reports/${r.id}/file`), { headers: { ...appHeader, Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!res?.ok) { toast({ tone: "error", title: "Could not open the file", message: "Please try again." }); return; }
    await saveBlob(await res.blob(), r.fileName);
  };

  const sel = `w-full min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-ink ${focusRing}`;
  return (
    <ScreenShell title="Lost a book?" subtitle="Send your apology letter or report" icon={FileWarning} back="/m/profile">
      <form onSubmit={send} noValidate className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-3">
        {formError && <Alert>{formError}</Alert>}
        <div>
          <label htmlFor="lr-book" className="block text-sm font-medium text-ink mb-1.5">Which book?</label>
          <select id="lr-book" value={form.transactionId} onChange={e => setForm(v => ({ ...v, transactionId: e.target.value }))} className={`ak-select ${sel}`}>
            <option value="">Not one of my borrowed books / not sure</option>
            {loans.map(l => <option key={l.id} value={l.id}>{l.bookCopy?.book?.title ?? "Book"}{l.receiptNo ? ` · ${l.receiptNo}` : ""}</option>)}
          </select>
        </div>
        <div role="radiogroup" aria-label="Kind of document" className="grid grid-cols-2 gap-2">
          {[["APOLOGY", "Apology letter"], ["REPORT", "Report"]].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm(v => ({ ...v, kind: k! }))}
              className={`min-h-11 rounded-xl text-sm font-semibold ${focusRing} ${form.kind === k ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "bg-surface border border-line-strong text-ink"}`}>{l}</button>
          ))}
        </div>
        <div>
          <label htmlFor="lr-msg" className="block text-sm font-medium text-ink mb-1.5">Message to the librarian <span className="text-ink-muted font-normal">(optional)</span></label>
          <textarea id="lr-msg" rows={3} maxLength={1000} value={form.message} onChange={e => setForm(v => ({ ...v, message: e.target.value }))} placeholder="What happened, and when" className={`w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink ${focusRing}`} />
        </div>
        <div>
          <label htmlFor="lr-file" className="block text-sm font-medium text-ink mb-1.5">File (PDF, Word .docx / .doc, or a JPG / PNG photo, up to 10 MB)</label>
          <input id="lr-file" type="file" accept={ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} className={`w-full text-sm text-ink file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-primary file:font-semibold ${focusRing}`} />
          {file && <p className="text-xs text-ink-muted mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </div>
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? <Spinner /> : <Upload size={18} aria-hidden="true" />}{busy ? "Sending…" : "Send to the librarian"}</button>
      </form>

      <ListState loading={!reports && !error && "Loading…"} error={error} onRetry={() => void load()}>
        {reports && reports.length > 0 && (
          <section aria-labelledby="lr-sent" className="space-y-2">
            <h2 id="lr-sent" className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1 pt-2">Documents you sent</h2>
            <ul className="space-y-2">
              {reports.map(r => (
                <li key={r.id} className="bg-surface rounded-2xl border border-line p-4 space-y-1.5">
                  <div className="flex items-start gap-3">
                    <FileText size={20} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1 min-w-0"><p className="font-semibold text-ink truncate">{r.fileName}</p><p className="text-xs text-ink-muted">{r.kind === "REPORT" ? "Report" : "Apology letter"} · {phDate(r.createdAt)}</p></div>
                    <button type="button" onClick={() => void download(r)} aria-label={`Download ${r.fileName}`} className={`w-10 h-10 rounded-xl flex items-center justify-center text-primary hover:bg-primary-soft ${focusRing}`}><Download size={18} aria-hidden="true" /></button>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
                  {r.note && <p className="text-sm text-ink rounded-xl bg-page px-3 py-2"><b className="text-primary-strong">Librarian:</b> {r.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </ListState>
    </ScreenShell>
  );
}
