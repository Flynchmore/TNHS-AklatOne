import { useQuery } from "@tanstack/react-query";
import { RefreshButton } from "../../components/RefreshButton";
import { Activity, Database, Zap, Mail, HardDrive, DatabaseBackup, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { phDateTime } from "../../lib/dates";
import { useAuth } from "../auth/auth";
import { Panel } from "../../components/staff/ui";

interface Status {
  serverTime: string; startedAt: string; environment: string;
  database: { ok: boolean; version?: string; lastMigration?: string | null; error?: string };
  redis: string; email: boolean;
  backups: { automatic: boolean; encrypted: boolean; nextAutomatic: string | null; lastAutomatic: { name: string; createdAt: string } | null; count: number; totalBytes: number; disk: { freeBytes: number; totalBytes: number } | null };
}
type Tone = "ok" | "warn" | "off";
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const mb = (n: number) => (n > 1024 ** 3 ? gb(n) : `${(n / 1024 ** 2).toFixed(1)} MB`);
const TONE: Record<Tone, { icon: LucideIcon; cls: string; text: string }> = {
  ok: { icon: CheckCircle2, cls: "text-success bg-success-soft", text: "OK" },
  warn: { icon: AlertTriangle, cls: "text-warning bg-warning-soft", text: "Check" },
  off: { icon: MinusCircle, cls: "text-ink-muted bg-page", text: "Off" },
};

function Row({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-line bg-page p-3">
      <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="text-sm font-semibold text-ink break-words">{value}</p>
      </div>
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${t.cls}`}><t.icon size={13} aria-hidden="true" />{t.text}</span>
    </li>
  );
}

/** Settings > System status (librarian / admin): is everything AklatOne depends on working? */
export function SystemPanel() {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["system-status"],
    queryFn: async () => { const r = await apiFetch("/api/v1/system/status", { token }); if (!r.ok) throw new Error(r.message); return r.data as Status; },
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const s = q.data;
  const b = s?.backups;
  // Measured against the server clock, so the panel stays the same on every render.
  const lastAgeH = s && b?.lastAutomatic ? (Date.parse(s.serverTime) - Date.parse(b.lastAutomatic.createdAt)) / 3_600_000 : null;
  const diskLow = b?.disk ? b.disk.freeBytes < 2 * 1024 ** 3 : false;
  // Plain words for the librarian / authorised staff: what works, what needs attention, what to do.
  const checks: { icon: LucideIcon; label: string; value: string; tone: Tone }[] = s && b ? [
    { icon: Database, label: "Library records", tone: s.database.ok ? "ok" : "warn", value: s.database.ok ? "Working. Books, members and borrowing records are safe and reachable." : "Not answering. AklatOne cannot read or save records; ask the ICT coordinator to check the server." },
    { icon: Zap, label: "Sign-in protection", tone: s.redis.startsWith("unavailable") ? "warn" : "ok", value: s.redis.startsWith("unavailable") ? "Working with a backup method on this server (limits on wrong passwords still apply)." : "Working. Too many wrong passwords are blocked for a while." },
    { icon: Mail, label: "Email (codes and notices)", tone: s.email ? "ok" : "warn", value: s.email ? "Working. Sign-in codes, activation codes and notices are emailed." : "Not set up. Members cannot receive sign-in or activation codes by email; ask the ICT coordinator." },
    { icon: DatabaseBackup, label: "Automatic daily copy", tone: !b.automatic || (lastAgeH !== null && lastAgeH > 30) ? "warn" : "ok",
      value: !b.automatic ? "Turned off. Download a backup yourself (Backup and Restore) until it is turned on." : `${b.lastAutomatic ? `Last copy ${phDateTime(b.lastAutomatic.createdAt)}` : "No copy made yet"}${b.nextAutomatic ? `; next ${phDateTime(b.nextAutomatic)}` : ""}. ${b.encrypted ? "Protected with a password." : "Not password-protected."}` },
    { icon: HardDrive, label: "Space for backups", tone: b.disk ? (diskLow ? "warn" : "ok") : "off", value: b.disk ? `${b.count} saved cop${b.count === 1 ? "y" : "ies"} (${mb(b.totalBytes)}). ${gb(b.disk.freeBytes)} free${diskLow ? ": almost full, ask the ICT coordinator to free space." : "."}` : "No backups saved on the server yet." },
  ] : [];
  const issues = checks.filter(c => c.tone === "warn").length;
  return (
    <Panel title="System status" icon={Activity} className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-muted">{s ? `Last checked ${phDateTime(s.serverTime)}. Checks again every minute.` : "Checking the library server…"}</p>
        <RefreshButton onRefresh={() => q.refetch()} what="system status" label="Check again" />
      </div>
      {q.isError && <p role="alert" className="rounded-2xl bg-danger-soft text-danger p-4 font-semibold">The library server cannot be reached. Check the internet connection of this computer; if others have the same problem, contact the ICT coordinator.</p>}
      {s && b && (
        <>
          <div role="status" className={`flex items-center gap-3 rounded-2xl p-4 mb-4 ${issues ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
            {issues ? <AlertTriangle size={28} aria-hidden="true" /> : <CheckCircle2 size={28} aria-hidden="true" />}
            <div><p className="text-lg font-extrabold">{issues ? `${issues} thing${issues === 1 ? " needs" : "s need"} attention` : "Everything is working"}</p><p className="text-sm text-ink">{issues ? "See the items marked Check below and what to do." : "AklatOne is healthy: records, sign-in, email and backups are all fine."}</p></div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-3">{checks.map(c => <Row key={c.label} {...c} />)}</ul>
        </>
      )}
    </Panel>
  );
}
