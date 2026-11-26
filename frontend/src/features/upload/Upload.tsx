import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud, Wifi, WifiOff, Trash2, Library, Copy, Users, Undo2, Bell, AlertTriangle, CheckCircle2, type LucideIcon, BookUp } from "lucide-react";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, EmptyState, PageHeader, Panel, btn, btnSm, card } from "../../components/staff/ui";
import { removeOutbox, useOnline, useOutbox, type OutboxKind } from "../../lib/offline";
import { sendOutbox } from "./autoUpload";
import { phDateTime } from "../../lib/dates";

const KIND: Record<OutboxKind, { icon: LucideIcon; label: string }> = {
  book: { icon: Library, label: "Book" }, copy: { icon: Copy, label: "Copy" }, member: { icon: Users, label: "Member" },
  return: { icon: Undo2, label: "Return" }, notice: { icon: Bell, label: "Notice" }, lend: { icon: BookUp, label: "Lend" },
};

/** Desktop "Upload": changes made without internet, kept on this computer until the librarian sends them to the web. */
export function Upload() {
  const { token } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const items = useOutbox();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const failed = items.filter(i => i.error).length;

  const upload = async () => {
    setBusy(true);
    const r = await sendOutbox(token);
    setBusy(false);
    qc.invalidateQueries();
    if (r.stopped === "offline") toast({ tone: "error", title: "Upload paused", message: `${r.sent} sent. The connection dropped; the rest are still on this computer.` });
    else if (r.stopped === "signin") toast({ tone: "error", title: "Please sign in again", message: "Your session expired. Nothing was lost; sign in and upload again." });
    else if (r.failed) toast({ tone: "error", title: `${r.sent} uploaded, ${r.failed} need attention`, message: "Items the web rejected stay in the list with the reason." });
    else toast({ tone: "success", title: "All changes uploaded", message: `${r.sent} change${r.sent === 1 ? "" : "s"} sent. The web and mobile apps now show them.` });
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={UploadCloud} title="Upload" subtitle="Changes saved on this computer while there was no internet. Send them to the web when you're back online."
        actions={<button type="button" onClick={upload} disabled={!online || busy || items.length === 0} className={btn.primary}><UploadCloud size={18} aria-hidden="true" />{busy ? "Uploading…" : `Upload ${items.length || ""}`.trim()}</button>} />

      <div className={`${card} p-6 sm:p-7 flex flex-wrap items-center gap-5`}>
        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${online ? "bg-gradient-to-br from-success to-success-strong" : "bg-gradient-to-br from-warning to-[#7A3A06]"}`} aria-hidden="true">{online ? <Wifi size={22} /> : <WifiOff size={22} />}</span>
        <div className="flex-1 min-w-48">
          <p className="font-bold text-ink">{online ? "Connected to the internet" : "No internet connection"}</p>
          <p className="text-sm text-ink-muted">{online ? (items.length ? "They upload by themselves; press Upload to send them now." : "Everything is up to date.") : "Keep working: books, copies, members, returns and notices are saved here until you upload."}</p>
        </div>
        <div className="flex gap-2"><Badge tone="warning">{items.length} waiting</Badge>{failed > 0 && <Badge tone="danger">{failed} need attention</Badge>}</div>
      </div>

      {items.length === 0 ? <EmptyState icon={CheckCircle2} text="Nothing waiting to upload." /> : (
        <Panel title="Saved on this computer" icon={UploadCloud}>
          <ol className="space-y-2">
            {items.map((i, n) => {
              const k = KIND[i.kind];
              return (
                <li key={i.id} className={`flex items-start gap-3 p-3 rounded-2xl border ${i.error ? "border-danger/40 bg-danger-soft" : "border-line bg-page/60"}`}>
                  <span className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><k.icon size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{n + 1}. {i.label}</p>
                    <p className="text-xs text-ink-muted">{k.label} · saved {phDateTime(i.createdAt)}</p>
                    {i.error && <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-danger"><AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden="true" />Not uploaded: {i.error}</p>}
                  </div>
                  {confirm === i.id ? (
                    <span className="flex gap-2 ak-fade">
                      <button type="button" className={`${btn.danger} ${btnSm}`} onClick={() => { removeOutbox(i.id); setConfirm(null); toast({ tone: "info", title: "Removed", message: `"${i.label}" will not be uploaded.` }); }}>Remove</button>
                      <button type="button" className={`${btn.ghost} ${btnSm}`} onClick={() => setConfirm(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className={`${btn.secondary} ${btnSm} !text-danger hover:!border-danger hover:!bg-danger-soft`} onClick={() => setConfirm(i.id)} aria-label={`Remove ${i.label}`}><Trash2 size={14} aria-hidden="true" /></button>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      )}
    </div>
  );
}
