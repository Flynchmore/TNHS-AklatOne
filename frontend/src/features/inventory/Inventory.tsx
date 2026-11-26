import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, PlayCircle, CheckCircle2, AlertTriangle, SearchX, FileDown, Lock, History, Info } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { downloadXlsx } from "../../lib/download";
import { useOnline } from "../../lib/offline";
import { phDateTime } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Scanner } from "../../components/staff/Scanner";
import { Badge, EmptyState, PageHeader, Panel, Segmented, Skeleton, StaffDialog, StatTile, btn, btnSm, input, label, table } from "../../components/staff/ui";

interface Copy { id: string; barcode: string; status: string; location: string | null; lastVerifiedAt: string | null; scannedAt?: string; book: { id: string; title: string; authors: string | null; isbn: string | null } }
interface Audit { id: string; note: string | null; startedAt: string; closedAt: string | null; scanned?: number }
interface Report { audit: Audit; totals: { copies: number; scanned: number; notFound: number }; scans: Copy[]; notFound: Copy[]; mismatched: Copy[] }
interface ScanResult { copy: Copy; alreadyScanned: boolean; warning: string | null }
type Tab = "notFound" | "mismatched" | "scans";

/** Staff "Inventory audit" (stocktake): scan every copy on the shelves, then see what was not found. */
export function Inventory() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const canWrite = hasPerm("copies:write");
  const [viewing, setViewing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [last, setLast] = useState<ScanResult | { error: string } | null>(null);
  const [tab, setTab] = useState<Tab>("notFound");

  const audits = useQuery({
    queryKey: ["inventory-audits"],
    queryFn: async () => { const r = await apiFetch("/api/v1/inventory/audits", { token }); if (!r.ok) throw new Error(r.message); return (r.data as { items: Audit[] }).items; },
    enabled: !!token,
  });
  const open = audits.data?.find(a => !a.closedAt) ?? null;
  const shownId = viewing ?? open?.id ?? null;
  const report = useQuery({
    queryKey: ["inventory-report", shownId],
    queryFn: async () => { const r = await apiFetch(`/api/v1/inventory/audits/${shownId}`, { token }); if (!r.ok) throw new Error(r.message); return r.data as Report; },
    enabled: !!token && !!shownId,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["inventory-audits"] }); qc.invalidateQueries({ queryKey: ["inventory-report"] }); };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await apiFetch("/api/v1/inventory/audits", { method: "POST", token, body: JSON.stringify({ note: note.trim() || undefined }) });
    if (!r.ok) { toast({ tone: "error", title: "Could not start", message: r.message ?? "Please try again." }); return; }
    setStarting(false); setNote(""); setViewing(null); setLast(null);
    toast({ tone: "success", title: "Inventory audit started", message: "Scan the QR label of every copy on the shelves." });
    refresh();
  };

  const scan = async (code: string) => {
    if (!open) return;
    const r = await apiFetch(`/api/v1/inventory/audits/${open.id}/scan`, { method: "POST", token, body: JSON.stringify({ code }) });
    if (!r.ok) { setLast({ error: r.message ?? `Could not record ${code}.` }); return; }
    setLast(r.data as ScanResult);
    qc.invalidateQueries({ queryKey: ["inventory-report", open.id] });
  };

  const close = async () => {
    if (!open) return;
    const r = await apiFetch(`/api/v1/inventory/audits/${open.id}/close`, { method: "POST", token });
    setClosing(false);
    if (!r.ok) { toast({ tone: "error", title: "Could not close", message: r.message ?? "Please try again." }); return; }
    const t = (r.data as { totals: Report["totals"] }).totals;
    toast({ tone: "success", title: "Inventory audit closed", message: `${t.scanned} copies scanned, ${t.notFound} not found.` });
    setViewing(open.id); setLast(null);
    refresh();
  };

  const exportExcel = async () => {
    if (!shownId) return;
    try { const where = await downloadXlsx(token, `/api/v1/inventory/audits/${shownId}/export.xlsx`, "aklatone-inventory.xlsx"); toast({ tone: "success", title: "Report exported", message: `Saved to ${where}. ` + "Not found, records to check and scanned copies are in the Excel file." }); }
    catch (e) { toast({ tone: "error", title: "Export failed", message: (e as Error).message }); }
  };

  const r = report.data;
  const isOpen = !!r && !r.audit.closedAt;
  const rows = r ? r[tab] : [];
  return (
    <div className="space-y-6">
      <PageHeader icon={ClipboardCheck} title="Inventory audit" subtitle="Scan every copy on the shelves; AklatOne lists the copies that were not found."
        actions={<>
          {r && <button type="button" onClick={exportExcel} disabled={!online} className={btn.success}><FileDown size={18} aria-hidden="true" />Export Excel</button>}
          {canWrite && !open && <button type="button" onClick={() => setStarting(true)} disabled={!online} className={btn.success}><PlayCircle size={18} aria-hidden="true" />Start audit</button>}
          {canWrite && isOpen && <button type="button" onClick={() => setClosing(true)} disabled={!online} className={btn.primary}><Lock size={18} aria-hidden="true" />Close audit</button>}
        </>} />

      {!online && <p role="status" className="text-sm font-semibold text-warning bg-warning-soft rounded-2xl p-3">Inventory audits need a connection to the library server.</p>}
      {audits.isLoading && <Skeleton rows={3} />}
      {audits.data && !shownId && <EmptyState icon={ClipboardCheck} text={canWrite ? "No inventory audit yet. Start one, then scan the QR label of each copy on the shelves." : "No inventory audit yet."} />}

      {r && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile icon={CheckCircle2} label="Scanned" value={r.totals.scanned} hint={isOpen ? "So far" : `Audit closed ${phDateTime(r.audit.closedAt!)}`} />
            <StatTile icon={SearchX} label="Not found" value={r.totals.notFound} hint="Should be on the shelf" />
            <StatTile icon={AlertTriangle} label="Records to check" value={r.mismatched.length} hint="Scanned, but recorded as out or lost" />
          </div>

          {isOpen && canWrite && (
            <Panel title={`Scanning · started ${phDateTime(r.audit.startedAt)}${r.audit.note ? ` · ${r.audit.note}` : ""}`} icon={ClipboardCheck}>
              <Scanner onCode={scan} disabled={!online} />
              {last && ("error" in last
                ? <p role="alert" className="mt-4 flex gap-2 text-sm font-semibold text-danger bg-danger-soft rounded-2xl p-3"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" />{last.error}</p>
                : <div role="status" className={`mt-4 rounded-2xl p-3 text-sm ${last.warning ? "bg-warning-soft" : "bg-success-soft"}`}>
                    <p className="font-semibold text-ink"><CheckCircle2 size={16} className="inline -mt-0.5 mr-1 text-success" aria-hidden="true" />{last.copy.book.title} <span className="font-mono text-xs">· {last.copy.barcode}</span>{last.alreadyScanned && <span className="ml-2"><Badge tone="primary">Already scanned</Badge></span>}</p>
                    {last.warning && <p className="mt-1 font-semibold text-warning">{last.warning}</p>}
                  </div>)}
              <p className="mt-4 text-xs text-ink-muted"><Info size={12} className="inline -mt-0.5" aria-hidden="true" /> Borrowed, lost and retired copies are not expected on the shelf. Copy statuses are never changed by the audit; fix them in Catalog &gt; Copies.</p>
            </Panel>
          )}

          <Segmented<Tab> label="Audit lists" value={tab} onChange={setTab} options={[
            { key: "notFound", label: "Not found", count: r.notFound.length },
            { key: "mismatched", label: "Records to check", count: r.mismatched.length },
            { key: "scans", label: "Scanned", count: r.scans.length },
          ]} />
          {!rows.length ? <EmptyState icon={CheckCircle2} text={tab === "notFound" ? "Every copy expected on the shelf was scanned." : tab === "mismatched" ? "No scanned copy disagrees with its record." : "Nothing scanned yet."} /> : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead className={table.head}><tr>{["Title / Author", "Copy", "Status", "Location", tab === "scans" ? "Scanned" : "Last verified"].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 300).map(c => (
                    <tr key={c.id} className={table.row}>
                      <td className={table.td}><div className="font-semibold text-ink">{c.book.title}</div><div className="text-xs text-ink-muted">{c.book.authors || "Unknown author"}</div></td>
                      <td className={`${table.td} font-mono text-xs`}>{c.barcode}</td>
                      <td className={table.td}><Badge tone={c.status === "AVAILABLE" ? "success" : c.status === "BORROWED" ? "primary" : "warning"}>{c.status}</Badge></td>
                      <td className={`${table.td} text-ink-muted`}>{c.location || "—"}</td>
                      <td className={`${table.td} text-ink-muted`}>{c.scannedAt ? phDateTime(c.scannedAt) : c.lastVerifiedAt ? phDateTime(c.lastVerifiedAt) : "Never verified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 300 && <p className="p-3 text-xs text-ink-muted">Showing 300 of {rows.length}. Export Excel for the full list.</p>}
            </div>
          )}
        </>
      )}

      {audits.data && audits.data.some(a => a.closedAt) && (
        <Panel title="Past audits" icon={History}>
          <ul className="divide-y divide-line">
            {audits.data.filter(a => a.closedAt).map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{phDateTime(a.startedAt)} · {a.scanned ?? 0} scanned{a.note ? ` · ${a.note}` : ""}</span>
                <button type="button" onClick={() => { setViewing(a.id); setTab("notFound"); }} aria-current={shownId === a.id} className={`${btn.secondary} ${btnSm}`}>View report</button>
              </li>
            ))}
          </ul>
          {viewing && open && <button type="button" onClick={() => setViewing(null)} className={`${btn.ghost} ${btnSm} mt-2`}>Back to the audit in progress</button>}
        </Panel>
      )}

      <StaffDialog open={starting} onClose={() => setStarting(false)} title="Start an inventory audit" subtitle="Only one audit can be in progress at a time." icon={PlayCircle} tone="success" onSubmit={start}
        footer={<><button type="button" onClick={() => setStarting(false)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.success}>Start</button></>}>
        <div><label htmlFor="inv-note" className={label}>Note <span className="font-normal text-ink-muted">(optional, e.g. "End of school year 2026")</span></label><input id="inv-note" value={note} onChange={e => setNote(e.target.value)} maxLength={255} className={input} /></div>
      </StaffDialog>
      <StaffDialog open={closing} onClose={() => setClosing(false)} title="Close this inventory audit?" subtitle={r ? `${r.totals.scanned} scanned · ${r.totals.notFound} not found` : undefined} icon={Lock} tone="warning" onSubmit={e => { e.preventDefault(); void close(); }}
        footer={<><button type="button" onClick={() => setClosing(false)} className={btn.secondary}>Keep scanning</button><button type="submit" className={btn.primary}>Close audit</button></>}>
        <p className="text-sm text-ink">After closing, no more copies can be scanned in this audit. The report stays available under Past audits.</p>
      </StaffDialog>
    </div>
  );
}
