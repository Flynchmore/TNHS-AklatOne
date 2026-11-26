import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DatabaseBackup, Download, Upload, ShieldAlert, Server, Lock, FileArchive, RotateCcw, WifiOff } from "lucide-react";
import { apiFetch, apiUrl } from "../../lib/api";
import { useOnline } from "../../lib/offline";
import { phDateTime } from "../../lib/dates";
import { errorOf, fileNameOf, saveBlob } from "../../lib/download";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, FormSection, Panel, Skeleton, StaffDialog, btn, btnSm, input, label, table } from "../../components/staff/ui";

interface ServerBackup { name: string; size: number; createdAt: string; encrypted: boolean }
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Settings > Backup and Restore (Staff Web and Desktop; librarian / admin). */
export function BackupPanel() {
  const { token, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const [myPw, setMyPw] = useState("");
  const [backupPw, setBackupPw] = useState("");
  const [backupPw2, setBackupPw2] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [restorePw, setRestorePw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"download" | "restore" | null>(null);
  const [serverRestore, setServerRestore] = useState<ServerBackup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const files = useQuery({
    queryKey: ["backup-files"],
    queryFn: async () => { const r = await apiFetch("/api/v1/backup/files", { token }); if (!r.ok) throw new Error(r.message); return (r.data as { items: ServerBackup[] }).items; },
    enabled: !!token && online,
  });
  const auth = { Authorization: `Bearer ${token}` };

  const afterRestore = (safety: string) => {
    toast({ tone: "success", title: "Database restored", message: `A safety copy of the old data was saved as ${safety}. Please sign in again.` });
    qc.clear();
    setTimeout(() => { logout(); nav("/login"); }, 1500);
  };

  const download = async () => {
    if (!myPw) { toast({ tone: "error", title: "Enter your password", message: "Your own password is needed to download a backup." }); return; }
    if (backupPw && backupPw !== backupPw2) { toast({ tone: "error", title: "Backup passwords do not match", message: "Type the same backup password twice." }); return; }
    setBusy("download");
    try {
      const res = await fetch(apiUrl("/api/v1/backup/download"), { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: myPw, ...(backupPw ? { password: backupPw } : {}) }) });
      if (!res.ok) throw new Error(await errorOf(res));
      const name = fileNameOf(res, "aklatone-backup.sql.gz");
      saveBlob(await res.blob(), name);
      toast({ tone: "success", title: "Backup downloaded", message: backupPw ? `${name} is protected; keep the backup password safe, it cannot be recovered.` : `${name}. Keep it somewhere safe: it contains members' personal data.` });
      setBackupPw(""); setBackupPw2("");
    } catch (e) {
      toast({ tone: "error", title: "Backup failed", message: (e as Error).message });
    } finally { setBusy(null); }
  };

  const restoreUpload = async () => {
    if (!file || !myPw || confirm !== "RESTORE") return;
    setBusy("restore");
    try {
      const res = await fetch(apiUrl("/api/v1/backup/restore"), {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/octet-stream", "X-Confirm": "RESTORE", "X-Current-Password": myPw, ...(restorePw ? { "X-Backup-Password": restorePw } : {}) },
        body: file,
      });
      if (!res.ok) throw new Error(await errorOf(res));
      afterRestore(((await res.json()) as { data: { safetyBackup: string } }).data.safetyBackup);
    } catch (e) {
      toast({ tone: "error", title: "Restore failed", message: `${(e as Error).message} Nothing was changed.` });
    } finally { setBusy(null); }
  };

  const downloadServer = async (b: ServerBackup) => {
    if (!myPw) { toast({ tone: "error", title: "Enter your password", message: "Type your password at the top of this panel first." }); return; }
    const res = await fetch(apiUrl(`/api/v1/backup/files/${encodeURIComponent(b.name)}/download`), { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: myPw }) });
    if (!res.ok) { toast({ tone: "error", title: "Download failed", message: await errorOf(res) }); return; }
    saveBlob(await res.blob(), b.name);
    toast({ tone: "success", title: "Backup downloaded", message: b.name });
  };

  const disabled = !online;
  return (
    <Panel title="Backup and Restore" icon={DatabaseBackup} className="lg:col-span-2">
      {disabled && <p role="status" className="flex items-center gap-2 text-sm font-semibold text-warning bg-warning-soft rounded-2xl p-3 mb-4"><WifiOff size={16} aria-hidden="true" />Backup and restore need a connection to the library server.</p>}
      <div className="space-y-5">
        <div className="max-w-md">
          <label htmlFor="bk-mypw" className={label}>Your password <span className="font-normal text-ink-muted">(needed for every backup action)</span></label>
          <input maxLength={128} id="bk-mypw" type="password" value={myPw} onChange={e => setMyPw(e.target.value)} autoComplete="current-password" className={input} />
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <FormSection title="Download a backup" icon={Download}>
            <p className="text-sm text-ink-muted">A copy of the whole library database (books, copies, members, borrowing records) as a MariaDB / MySQL <code>.sql.gz</code> file.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label htmlFor="bk-pw" className={label}>Backup password <span className="font-normal text-ink-muted">(recommended)</span></label><input maxLength={128} id="bk-pw" type="password" value={backupPw} onChange={e => setBackupPw(e.target.value)} autoComplete="new-password" className={input} /></div>
              <div><label htmlFor="bk-pw2" className={label}>Repeat backup password</label><input maxLength={128} id="bk-pw2" type="password" value={backupPw2} onChange={e => setBackupPw2(e.target.value)} autoComplete="new-password" className={input} /></div>
            </div>
            <p className="text-xs text-ink-muted"><Lock size={12} className="inline -mt-0.5" aria-hidden="true" /> With a backup password the file is encrypted (AES-256). Without it, anyone holding the file can read members' personal data.</p>
            <button type="button" onClick={download} disabled={disabled || busy !== null || !myPw} className={btn.primary}><Download size={16} aria-hidden="true" />{busy === "download" ? "Preparing backup…" : "Download backup"}</button>
          </FormSection>

          <FormSection title="Restore from a backup file" icon={Upload}>
            <p className="flex gap-2 text-sm font-semibold text-danger bg-danger-soft rounded-2xl p-3"><ShieldAlert size={18} className="shrink-0" aria-hidden="true" />Restoring replaces ALL current library data with the backup. A safety copy of the current data is saved on the server first.</p>
            <div>
              <label htmlFor="bk-file" className={label}>Backup file (.sql, .sql.gz or .sql.gz.enc)</label>
              <input id="bk-file" ref={fileRef} type="file" accept=".sql,.gz,.enc" onChange={e => setFile(e.target.files?.[0] ?? null)} className={`${input} file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary file:font-semibold`} />
            </div>
            {file?.name.endsWith(".enc") && <div><label htmlFor="bk-rpw" className={label}>Backup password</label><input maxLength={128} id="bk-rpw" type="password" value={restorePw} onChange={e => setRestorePw(e.target.value)} className={input} /></div>}
            <div><label htmlFor="bk-confirm" className={label}>Type RESTORE to confirm</label><input maxLength={7} id="bk-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" className={input} /></div>
            <button type="button" onClick={restoreUpload} disabled={disabled || busy !== null || !file || !myPw || confirm !== "RESTORE"} className={btn.danger}><RotateCcw size={16} aria-hidden="true" />{busy === "restore" ? "Restoring… do not close" : "Restore database"}</button>
          </FormSection>
        </div>

        <FormSection title="Backups saved on the server" icon={Server}>
          <p className="text-sm text-ink-muted">A copy is saved automatically every day, plus a safety copy before each restore.</p>
          {files.isLoading ? <Skeleton rows={3} className="h-10" /> : !files.data?.length ? <p className="text-sm text-ink-muted">No server backups yet.</p> : (
            <div className={table.wrap}>
              <table className={table.table}>
                <thead className={table.head}><tr><th className={table.th}>File</th><th className={table.th}>Saved</th><th className={table.th}>Size</th><th className={`${table.th} text-right`}>Actions</th></tr></thead>
                <tbody>
                  {files.data.map(b => (
                    <tr key={b.name} className={table.row}>
                      <td className={`${table.td} font-mono text-xs`}><FileArchive size={14} className="inline -mt-0.5 mr-1 text-primary" aria-hidden="true" />{b.name} {b.encrypted && <Badge tone="success">Encrypted</Badge>}</td>
                      <td className={`${table.td} text-ink-muted`}>{phDateTime(b.createdAt)}</td>
                      <td className={`${table.td} text-ink-muted`}>{kb(b.size)}</td>
                      <td className={table.td}><div className="flex justify-end gap-2">
                        <button type="button" className={`${btn.secondary} ${btnSm}`} onClick={() => downloadServer(b)} disabled={disabled}><Download size={14} aria-hidden="true" />Download</button>
                        <button type="button" className={`${btn.secondary} ${btnSm} !text-danger hover:!border-danger hover:!bg-danger-soft`} onClick={() => setServerRestore(b)} disabled={disabled}><RotateCcw size={14} aria-hidden="true" />Restore</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>
      </div>
      <ServerRestoreDialog backup={serverRestore} myPw={myPw} onClose={() => setServerRestore(null)} onDone={afterRestore} />
    </Panel>
  );
}

function ServerRestoreDialog({ backup, myPw, onClose, onDone }: { backup: ServerBackup | null; myPw: string; onClose: () => void; onDone: (safety: string) => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backup) return;
    if (!myPw) { toast({ tone: "error", title: "Enter your password", message: "Type your password at the top of the Backup panel first." }); return; }
    setBusy(true);
    const r = await apiFetch(`/api/v1/backup/files/${encodeURIComponent(backup.name)}/restore`, { method: "POST", token, body: JSON.stringify({ currentPassword: myPw, confirm, ...(pw ? { backupPassword: pw } : {}) }) });
    setBusy(false);
    if (!r.ok) { toast({ tone: "error", title: "Restore failed", message: `${r.message ?? "Please try again."} Nothing was changed.` }); return; }
    onClose();
    onDone((r.data as { safetyBackup: string }).safetyBackup);
  };
  return (
    <StaffDialog open={!!backup} onClose={onClose} title="Restore this backup?" subtitle={backup ? `${backup.name} · ${phDateTime(backup.createdAt)}` : undefined} icon={RotateCcw} tone="danger" onSubmit={go}
      footer={<>
        <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
        <button type="submit" disabled={busy || confirm !== "RESTORE"} className={btn.danger}>{busy ? "Restoring… do not close" : "Restore database"}</button>
      </>}>
      <p className="flex gap-2 text-sm font-semibold text-danger bg-danger-soft rounded-2xl p-3"><ShieldAlert size={18} className="shrink-0" aria-hidden="true" />All current library data will be replaced by this backup. A safety copy of the current data is saved first.</p>
      {backup?.encrypted && <div><label htmlFor="srv-pw" className={label}>Backup password <span className="font-normal text-ink-muted">(leave blank if it uses the server's backup key)</span></label><input maxLength={128} id="srv-pw" type="password" value={pw} onChange={e => setPw(e.target.value)} className={input} /></div>}
      <div><label htmlFor="srv-confirm" className={label}>Type RESTORE to confirm</label><input maxLength={7} id="srv-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" className={input} /></div>
    </StaffDialog>
  );
}
