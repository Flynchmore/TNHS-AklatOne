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
  return (
    <Panel title="System status" icon={Activity} className="lg:col-span-2">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-muted">{s ? `Checked ${phDateTime(s.serverTime)} · server running since ${phDateTime(s.startedAt)}` : "Checking the library server…"}</p>
        <RefreshButton onRefresh={() => q.refetch()} what="system status" label="Check again" />
      </div>
      {q.isError && <p role="alert" className="text-sm text-danger">Could not reach the library server. Backups and sign-in need it.</p>}
      {s && b && (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <Row icon={Database} label="Database" tone={s.database.ok ? "ok" : "warn"} value={s.database.ok ? `${s.database.version ?? "MariaDB"} · ${s.database.lastMigration ?? "no migrations"}` : s.database.error ?? "Not answering"} />
          <Row icon={Zap} label="Redis (sign-in limits)" tone={s.redis === "connected" ? "ok" : s.redis === "not configured" ? "off" : "warn"} value={s.redis === "connected" ? "Connected" : s.redis === "not configured" ? "Not set up (limits kept in server memory)" : "Unavailable, using server memory"} />
          <Row icon={Mail} label="Email (codes and notices)" tone={s.email ? "ok" : "warn"} value={s.email ? "Configured" : "Not configured: sign-in codes and notices are not emailed"} />
          <Row icon={DatabaseBackup} label="Automatic backups" tone={!b.automatic ? "warn" : lastAgeH !== null && lastAgeH > 30 ? "warn" : "ok"}
            value={!b.automatic ? "Turned off" : `${b.lastAutomatic ? `Last ${phDateTime(b.lastAutomatic.createdAt)}` : "None yet"}${b.nextAutomatic ? ` · next ${phDateTime(b.nextAutomatic)}` : ""}${b.encrypted ? " · encrypted" : " · not encrypted"}`} />
          <Row icon={HardDrive} label="Backup storage" tone={b.disk ? (diskLow ? "warn" : "ok") : "off"} value={`${b.count} file${b.count === 1 ? "" : "s"}, ${mb(b.totalBytes)}${b.disk ? ` · ${gb(b.disk.freeBytes)} free of ${gb(b.disk.totalBytes)}` : " · folder not created yet"}`} />
        </ul>
      )}
    </Panel>
  );
}
