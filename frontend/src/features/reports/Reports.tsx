import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ArrowLeftRight, BookUp, BookCheck, AlertTriangle, Trophy, Copy, CalendarRange, TrendingUp, Users, ClipboardCheck, FileDown, Timer } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, Panel, Skeleton, StatTile, btn, input, table } from "../../components/staff/ui";
import { PageHeader } from "../../components/staff/ui";
import { phDate, phDayEnd, phDayStart, phISODate } from "../../lib/dates";
import { txPath } from "../../lib/offline";
import { SplineArea } from "../../components/SplineArea";
import { fmtDuration } from "../../components/mobile/screenTime";
import { downloadXlsx } from "../../lib/download";
import { useOnline } from "../../lib/offline";

interface Overdue { id: string; dueAt: string; daysOverdue: number; bookCopy?: { book?: { title: string } }; borrower?: { username: string; displayName?: string | null } }

/** Horizontal bars: one series, labelled values (no colour-only meaning). */
function Bars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <p className="text-sm text-ink-muted py-6 text-center">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} className="" style={{ animationDelay: `${i * 0.04}s` }}>
          <div className="flex justify-between gap-3 text-sm mb-1"><span className="text-ink font-medium truncate">{r.label}</span><span className="text-ink-muted tabular-nums shrink-0">{r.value}</span></div>
          <div className="h-2.5 rounded-full bg-primary-soft overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-strong motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

interface TimeSummary {
  app: { members: { seconds: number; people: number }; librarians: { seconds: number; people: number } };
  library: { visits: number; visitors: number; seconds: number; averageSeconds: number | null; withoutTimeOut: number; perDay: { day: string; count: number }[] };
  loans: { returned: number; averageDays: number | null };
}
interface Stats { total: number; monthly: { month: string; count: number }[]; byRole: Record<string, number>; byOutcome: Record<string, number> }
const OUTCOME: Record<string, string> = { STILL_BORROWED: "Still borrowed", RETURNED_ON_TIME: "Returned on time", RETURNED_LATE: "Returned late", DAMAGED: "Returned torn / damaged", MISSING: "Missing" };
const monthLabel = (m: string) => new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`));

export function Reports() {
  const { token } = useAuth();
  const toast = useToast();
  const [from, setFrom] = useState(() => phISODate(Date.now() - 30 * 86400000));
  const [to, setTo] = useState(() => phISODate());
  // Whole Philippine days, "to" inclusive (encoded because of the "+08:00" offset).
  const range = `from=${encodeURIComponent(phDayStart(from))}&to=${encodeURIComponent(phDayEnd(to))}`;
  const get = <T,>(path: string) => async () => { const r = await apiFetch(path, { token }); if (!r.ok) throw new Error(r.message); return r.data as T; };

  const circ = useQuery({ queryKey: ["rep-circ", range], queryFn: get<{ total: number; active: number; returned: number; overdue: number }>(`/api/v1/reports/circulation?${range}`), enabled: !!token });
  const popular = useQuery({ queryKey: ["rep-popular", range], queryFn: get<{ items: { title: string; borrowCount: number }[] }>(`/api/v1/reports/popular-books?${range}`), enabled: !!token });
  const copies = useQuery({ queryKey: ["rep-copies"], queryFn: get<{ status: string; count: number }[]>("/api/v1/reports/copies-by-status"), enabled: !!token });
  const stats = useQuery({ queryKey: ["rep-stats"], queryFn: get<Stats>("/api/v1/reports/statistics"), enabled: !!token });
  const time = useQuery({ queryKey: ["rep-time", from, to], queryFn: get<TimeSummary>(`/api/v1/time/summary?from=${from}&to=${to}`), enabled: !!token });
  const overdue = useQuery({ queryKey: ["rep-overdue"], queryFn: get<{ items: Overdue[]; total: number }>("/api/v1/reports/overdue?limit=50"), enabled: !!token });

  const apply = (f: string, t: string) => {
    if (f > t) { toast({ tone: "error", title: "Check the dates", message: "The start date must be on or before the end date." }); return; }
    setFrom(f); setTo(t);
    toast({ tone: "info", title: "Report updated", message: `Showing ${phDate(phDayStart(f))} to ${phDate(phDayStart(t))}.` });
  };
  const online = useOnline();
  const exportExcel = async () => {
    try {
      await downloadXlsx(token, `/api/v1/reports/export.xlsx?${range}`, "aklatone-reports.xlsx");
      toast({ tone: "success", title: "Reports exported", message: "Summary, borrowed books, popular books, copies and overdue books are in the Excel file." });
    } catch (e) { toast({ tone: "error", title: "Export failed", message: (e as Error).message }); }
  };
  const preset = (days: number) => apply(phISODate(Date.now() - days * 86400000), phISODate());

  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Reports" subtitle="Borrowing statistics, popular books, copy status and overdue books."
        actions={<button type="button" onClick={exportExcel} disabled={!online} title={online ? "Uses the date range below" : "Needs a connection to the server"} className={btn.secondary}><FileDown size={18} aria-hidden="true" />Export Excel</button>} />

      <form className="flex flex-wrap items-end gap-3 p-4 rounded-3xl bg-surface border border-line shadow-sm" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); apply(String(d.get("from")), String(d.get("to"))); }}>
        <span className="flex items-center gap-2 text-sm font-semibold text-primary-strong self-center"><CalendarRange size={18} aria-hidden="true" />Date range</span>
        <div><label htmlFor="rep-from" className="block text-xs text-ink-muted mb-1">From</label><input id="rep-from" name="from" type="date" defaultValue={from} key={`f${from}`} max={phISODate()} className={`${input} !w-auto`} /></div>
        <div><label htmlFor="rep-to" className="block text-xs text-ink-muted mb-1">To</label><input id="rep-to" name="to" type="date" defaultValue={to} key={`t${to}`} max={phISODate()} className={`${input} !w-auto`} /></div>
        <button type="submit" className={btn.primary}>Apply</button>
        <div className="flex gap-2 ml-auto">
          {[[7, "7 days"], [30, "30 days"], [365, "1 year"]].map(([d, l]) => <button key={d} type="button" onClick={() => preset(d as number)} className={btn.ghost}>{l}</button>)}
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {circ.isLoading ? <div className="col-span-full"><Skeleton rows={1} className="h-36" /></div> : circ.isError ? <p role="alert" className="text-danger col-span-full">Could not load borrowing statistics.</p> : (
          <>
            <StatTile icon={ArrowLeftRight} label="Books lent" value={circ.data!.total} hint="In the selected dates" />
            <StatTile icon={BookUp} label="Still borrowed" value={circ.data!.active} hint="Not yet returned" />
            <StatTile icon={BookCheck} label="Returned" value={circ.data!.returned} tone="success" />
            <StatTile icon={AlertTriangle} label="Overdue" value={circ.data!.overdue} tone="danger" />
          </>
        )}
      </div>

      <Panel title="Statistics: books lent per month" icon={TrendingUp} action={stats.data ? <span className="text-sm text-ink-muted">{stats.data.total} in the last 12 months</span> : undefined}>
        {stats.isLoading ? <Skeleton rows={1} className="h-56" /> : stats.isError ? <p role="alert" className="text-danger text-sm">Could not load statistics.</p> : <SplineArea title="Books lent per month" height={150} points={stats.data!.monthly.map(r => ({ label: monthLabel(r.month), value: r.count, display: `${r.count} book${r.count === 1 ? "" : "s"} in ${monthLabel(r.month)} ${r.month.slice(0, 4)}` }))} />}
      </Panel>

      <Panel title="Time spent" icon={Timer} action={<span className="text-sm text-ink-muted">Selected dates</span>}>
        {time.isLoading ? <Skeleton rows={1} className="h-36" /> : time.isError || !time.data ? <p role="alert" className="text-danger text-sm">Could not load time spent.</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Library visits", `${time.data.library.visits}`, `${time.data.library.visitors} different member(s)`],
                ["Time in the library", fmtDuration(time.data.library.seconds), time.data.library.averageSeconds === null ? "No finished visits" : `${fmtDuration(time.data.library.averageSeconds)} per visit`],
                ["Members in the app", fmtDuration(time.data.app.members.seconds), `${time.data.app.members.people} member(s)`],
                ["Librarians in the app", fmtDuration(time.data.app.librarians.seconds), `${time.data.app.librarians.people} account(s)`],
              ].map(([k, v, hint]) => (
                <div key={k} className="rounded-2xl bg-page border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</p><p className="text-xl font-bold text-ink">{v}</p><p className="text-xs text-ink-muted">{hint}</p></div>
              ))}
            </div>
            <p className="text-sm text-ink-muted">Books returned in these dates were kept {time.data.loans.averageDays === null ? "—" : <b className="text-ink">{time.data.loans.averageDays} days</b>} on average ({time.data.loans.returned} returned). {time.data.library.withoutTimeOut > 0 && <>{time.data.library.withoutTimeOut} visit(s) have no Time Out and are not counted in library time.</>}</p>
            {time.data.library.perDay.length > 1 && <SplineArea title="Library visits per day" height={140} points={time.data.library.perDay.map(d => ({ label: phDate(`${d.day}T12:00:00+08:00`).replace(/, \d{4}$/, ""), value: d.count, display: `${d.count} visit(s) on ${phDate(`${d.day}T12:00:00+08:00`)}` }))} />}
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Borrowers by role" icon={Users}>
          {stats.isLoading ? <Skeleton rows={2} className="h-8" /> : <Bars rows={Object.entries(stats.data?.byRole ?? {}).filter(([k, v]) => k !== "Not set" || v > 0).map(([k, v]) => ({ label: k === "Student" ? "Students" : k === "Teacher" ? "Teachers" : "Role not set", value: v }))} empty="No books lent in the last 12 months." />}
        </Panel>
        <Panel title="How books came back" icon={ClipboardCheck}>
          {stats.isLoading ? <Skeleton rows={3} className="h-8" /> : <Bars rows={Object.entries(stats.data?.byOutcome ?? {}).map(([k, v]) => ({ label: OUTCOME[k] ?? k, value: v }))} empty="No books lent in the last 12 months." />}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Most borrowed books" icon={Trophy}>
          {popular.isLoading ? <Skeleton rows={4} className="h-8" /> : <Bars rows={(popular.data?.items ?? []).slice(0, 10).map(p => ({ label: p.title, value: p.borrowCount }))} empty="No books were borrowed in these dates." />}
        </Panel>
        <Panel title="Copies by status" icon={Copy}>
          {copies.isLoading ? <Skeleton rows={4} className="h-8" /> : <Bars rows={(copies.data ?? []).map(c => ({ label: c.status.charAt(0) + c.status.slice(1).toLowerCase(), value: c.count }))} empty="No copies recorded." />}
        </Panel>
      </div>

      <Panel title={`Overdue books${overdue.data ? ` (${overdue.data.total})` : ""}`} icon={AlertTriangle} action={<Link to={`${txPath}?tab=borrowed`} className={btn.ghost}>Send notices</Link>}>
        {overdue.isLoading ? <Skeleton rows={3} className="h-10" /> : !overdue.data?.items.length ? <p className="text-sm text-ink-muted py-6 text-center">No overdue books.</p> : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}><tr>{["Book", "Member", "Due", "Days overdue"].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody>
                {overdue.data.items.map(o => (
                  <tr key={o.id} className={table.row}>
                    <td className={`${table.td} font-semibold text-ink`}>{o.bookCopy?.book?.title}</td>
                    <td className={`${table.td} text-ink`}>{o.borrower?.displayName || o.borrower?.username}</td>
                    <td className={`${table.td} text-ink-muted`}>{phDate(o.dueAt)}</td>
                    <td className={table.td}><Badge tone="danger">{o.daysOverdue} day{o.daysOverdue === 1 ? "" : "s"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
