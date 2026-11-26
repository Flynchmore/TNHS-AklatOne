import { useState } from "react";
import { FileSpreadsheet, Upload, AlertTriangle, EyeOff, PlusCircle, PencilLine, XCircle, Info, FileDown } from "lucide-react";
import { apiFetch, apiUrl } from "../../lib/api";
import { downloadXlsx, errorOf } from "../../lib/download";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, FormSection, Segmented, StaffDialog, btn, btnSm, input, label, table } from "../../components/staff/ui";

interface Preview {
  token: string; rows: number; unchanged: number; ignoredColumns: string[];
  create: { row: number; title: string; authors: string | null; isbn: string | null; serialNumber: string | null; copies: number }[];
  update: { row: number; id: string; title: string; changes: { field: string; from: string; to: string }[] }[];
  hide: { id: string; title: string; authors: string | null; isbn: string | null }[];
  errors: { row: number; message: string }[];
}
type Tab = "create" | "update" | "hide" | "errors";

/** Catalog > Import Excel: upload, preview every change, then apply in one step. */
export function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<Tab>("create");
  const [hideMissing, setHideMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => { setFile(null); setPreview(null); setHideMissing(false); setTab("create"); onClose(); };

  const check = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/v1/catalog/import/preview"), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error(await errorOf(res));
      const p = ((await res.json()) as { data: Preview }).data;
      setPreview(p);
      setHideMissing(false);
      setTab(p.create.length ? "create" : p.update.length ? "update" : p.errors.length ? "errors" : "hide");
    } catch (e) {
      toast({ tone: "error", title: "Could not read the file", message: (e as Error).message });
    } finally { setBusy(false); }
  };

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) { await check(); return; }
    setBusy(true);
    const r = await apiFetch("/api/v1/catalog/import/apply", { method: "POST", token, body: JSON.stringify({ token: preview.token, hideMissing }) });
    setBusy(false);
    if (!r.ok) { toast({ tone: "error", title: "Import not applied", message: r.message ?? "Please try again. Nothing was changed." }); if (r.status === 410) setPreview(null); return; }
    const d = r.data as { created: number; updated: number; hidden: number; skipped: number };
    toast({ tone: "success", title: "Import applied", message: `${d.created} added, ${d.updated} updated, ${d.hidden} hidden${d.skipped ? `, ${d.skipped} rows skipped (errors)` : ""}.` });
    onDone();
    close();
  };

  const template = async () => {
    try { const where = await downloadXlsx(token, "/api/v1/catalog/import-template.xlsx", "aklatone-books-template.xlsx"); toast({ tone: "success", title: "Template saved", message: `Saved to ${where}. Fill in the rows (the columns are ready), then import it here.` }); }
    catch (e) { toast({ tone: "error", title: "Download failed", message: (e as Error).message }); }
  };

  const nothing = preview && !preview.create.length && !preview.update.length && !(hideMissing && preview.hide.length);
  return (
    <StaffDialog open={open} onClose={close} wide icon={FileSpreadsheet} title="Import books from Excel" subtitle="Preview every change before anything is saved." onSubmit={apply}
      footer={<>
        <button type="button" onClick={close} className={btn.secondary}>Cancel</button>
        {preview
          ? <button type="submit" disabled={busy || !!nothing} className={btn.primary}><Upload size={16} aria-hidden="true" />{busy ? "Applying…" : "Apply import"}</button>
          : <button type="submit" disabled={busy || !file} className={btn.primary}>{busy ? "Checking…" : "Check file"}</button>}
      </>}>
      <FormSection title="1. Choose the file" icon={Upload}>
        <p className="text-sm text-ink-muted">Columns: Title (required), Author, ISBN, Serial No., Publisher, Year, Subject, Wattpad, Genre, Description, Copies, Hidden. Other columns are ignored.</p>
        <button type="button" onClick={template} className={`${btn.success} ${btnSm}`}><FileDown size={14} aria-hidden="true" />Download the Excel template (.xlsx)</button>
        <div>
          <label htmlFor="import-file" className={label}>Excel file (.xlsx, up to 10 MB)</label>
          <input id="import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} className={`${input} file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary file:font-semibold`} />
        </div>
      </FormSection>

      {preview && (
        <FormSection title="2. Review the changes" icon={Info}>
          <p className="text-sm text-ink">
            {preview.rows} rows read: <b>{preview.create.length}</b> new, <b>{preview.update.length}</b> changed, <b>{preview.unchanged}</b> unchanged, <b className={preview.errors.length ? "text-danger" : ""}>{preview.errors.length}</b> with errors (skipped).
          </p>
          {preview.ignoredColumns.length > 0 && <p className="text-xs text-ink-muted">Ignored columns (not saved): {preview.ignoredColumns.join(", ")}</p>}
          <Segmented<Tab> label="Import preview" value={tab} onChange={setTab} options={[
            { key: "create", label: "New", count: preview.create.length },
            { key: "update", label: "Changed", count: preview.update.length },
            { key: "hide", label: "Not in file", count: preview.hide.length },
            { key: "errors", label: "Errors", count: preview.errors.length },
          ]} />
          <div className="max-h-72 overflow-auto">
            {tab === "create" && <List empty="No new books." head={["Row", "Title / Author", "ISBN", "Serial", "Copies"]} rows={preview.create.map(c => [c.row, <span key="t"><PlusCircle size={14} className="inline -mt-0.5 mr-1 text-success" aria-hidden="true" /><b>{c.title}</b><div className="text-xs text-ink-muted">{c.authors || "Unknown author"}</div></span>, c.isbn ?? "—", c.serialNumber ?? "—", c.copies])} />}
            {tab === "update" && <List empty="No changes to existing books." head={["Row", "Book", "Changes"]} rows={preview.update.map(u => [u.row, <span key="t"><PencilLine size={14} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" /><b>{u.title}</b></span>, <ul key="c" className="space-y-0.5">{u.changes.map(c => <li key={c.field} className="text-xs"><b>{c.field}:</b> <span className="line-through text-ink-muted">{c.from}</span> → <span className="text-ink">{c.to}</span></li>)}</ul>])} />}
            {tab === "hide" && <List empty="Every book in AklatOne is in the file." head={["Title / Author", "ISBN"]} rows={preview.hide.map(h => [<span key="t"><EyeOff size={14} className="inline -mt-0.5 mr-1 text-warning" aria-hidden="true" /><b>{h.title}</b><div className="text-xs text-ink-muted">{h.authors || "Unknown author"}</div></span>, h.isbn ?? "—"])} />}
            {tab === "errors" && <List empty="No errors." head={["Row", "Problem"]} rows={preview.errors.map(e => [e.row, <span key="m" className="text-danger"><XCircle size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />{e.message}</span>])} />}
          </div>
          {preview.hide.length > 0 && (
            <div className="rounded-2xl bg-warning-soft p-3 space-y-2">
              <p className="flex gap-2 text-sm font-semibold text-warning"><AlertTriangle size={18} className="shrink-0" aria-hidden="true" />{preview.hide.length} book{preview.hide.length === 1 ? " is" : "s are"} in AklatOne but not in this file.</p>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" checked={hideMissing} onChange={e => setHideMissing(e.target.checked)} className="mt-1 w-4 h-4 accent-primary" />
                <span>Hide these books from members. They are <b>not deleted</b>: their copies and borrowing history stay, and you can show them again from the Catalog ("Hidden books only", then Show).</span>
              </label>
            </div>
          )}
          {nothing && <p className="text-sm text-ink-muted"><Badge tone="primary">Nothing to apply</Badge> The catalog already matches this file.</p>}
        </FormSection>
      )}
    </StaffDialog>
  );
}

function List({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-ink-muted p-3">{empty}</p>;
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead className={table.head}><tr>{head.map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={table.row}>{r.map((c, j) => <td key={j} className={`${table.td} ${j === 0 && head[0] === "Row" ? "text-ink-muted tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

