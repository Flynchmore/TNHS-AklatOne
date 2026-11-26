import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ArrowLeftRight, BookUp, BookCheck, AlertTriangle, Trophy, Copy, CalendarRange, TrendingUp, Users, ClipboardCheck, FileDown, Timer, CalendarDays, Medal } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, Panel, Segmented, Skeleton, StatTile, btn, input, table } from "../../components/staff/ui";
import { ColumnChart, DonutChart } from "../../components/Charts";
import { MemberAvatar } from "../members/Members";
import { PageHeader } from "../../components/staff/ui";
import { phDate, phDayEnd, phDayStart, phISODate } from "../../lib/dates";
import { txPath } from "../../lib/offline";
import { SplineArea } from "../../components/SplineArea";
import { fmtDuration } from "../../components/mobile/screenTime";
import { downloadXlsx } from "../../lib/download";
import { useOnline } from "../../lib/offline";

interface Overdue { id: string; dueAt: string; daysOverdue: number; bookCopy?: { book?: { title: string } }; borrower?: { username: string; displayName?: string | null; maskedId?: string | null } }
interface Week { from: string; to: string; days: { day: string; borrowed: number; returned: number; visits: number }[]; loans: { at: string; day: string; memberId: string | null; group: string | null; title: string; copy: string }[] }
export interface TopMember { memberId: string; maskedId: string | null; memberType: string | null; group: string | null; avatarUrl: string | null; borrows: number; reviews: number; visits: number; score: number; books: string[] }
type Period = "day" | "week" | "month";
const OUTCOME_COLOR: Record<string, string> = { STILL_BORROWED: "#3354B5", RETURNED_ON_TIME: "#15803D", RETURNED_LATE: "#D97706", DAMAGED: "#C42B2A", MISSING: "#64748B" };
const STATUS_COLOR: Record<string, string> = { AVAILABLE: "#15803D", BORROWED: "#3354B5", RESERVED: "#7C3AED", DAMAGED: "#D97706", LOST: "#C42B2A", RETIRED: "#64748B" };
const weekday = (d: string) => new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "Asia/Manila" }).format(new Date(`${d}T12:00:00+08:00`));

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
  const week = useQuery({ queryKey: ["rep-week"], queryFn: get<Week>("/api/v1/reports/this-week"), enabled: !!token });
  const [period, setPeriod] = useState<Period>("week");
  const top = useQuery({ queryKey: ["rep-top", period], queryFn: get<{ from: string; to: string; items: TopMember[] }>(`/api/v1/reports/top-members?period=${period}&limit=10`), enabled: !!token });
  const overdue = useQuery({ queryKey: ["rep-overdue"], queryFn: get<{ items: Overdue[]; total: number }>("/api/v1/reports/overdue?limit=50"), enabled: !!token });

  const apply = (f: string, t: string) => {
    if (f > t) { toast({ tone: "error", title: "Check the dates", message: "The start date must be on or before the end date." }); return; }
    setFrom(f); setTo(t);
    toast({ tone: "info", title: "Report updated", message: `Showing ${phDate(phDayStart(f))} to ${phDate(phDayStart(t))}.` });
  };
  const online = useOnline();
  const exportExcel = async () => {
    try {
      const where = await downloadXlsx(token, `/api/v1/reports/export.xlsx?${range}`, "aklatone-reports.xlsx");
      toast({ tone: "success", title: "Reports saved", message: `Saved to ${where}. Summary, borrowed books, popular books, copies and overdue books are in the Excel file.` });
    } catch (e) { toast({ tone: "error", title: "Export failed", message: (e as Error).message }); }
  };
  const preset = (days: number) => apply(phISODate(Date.now() - days * 86400000), phISODate());

  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Reports" subtitle="Borrowing statistics, popular books, copy status and overdue books."
        actions={<button type="button" onClick={exportExcel} disabled={!online} title={online ? "Uses the date range below" : "Needs a connection to the server"} className={btn.success}><FileDown size={18} aria-hidden="true" />Export Excel</button>} />

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
          {stats.isLoading ? <Skeleton rows={2} className="h-8" /> : <DonutChart title="Borrowers by role" centerLabel="books lent" data={Object.entries(stats.data?.byRole ?? {}).map(([k, v]) => ({ label: k === "Student" ? "Students" : k === "Teacher" ? "Teachers" : "Role not set", value: v, color: k === "Student" ? "#3354B5" : k === "Teacher" ? "#D97706" : "#64748B" }))} empty="No books lent in the last 12 months." />}
        </Panel>
        <Panel title="How books came back" icon={ClipboardCheck}>
          {stats.isLoading ? <Skeleton rows={3} className="h-8" /> : <DonutChart title="How books came back" centerLabel="books" data={Object.entries(stats.data?.byOutcome ?? {}).map(([k, v]) => ({ label: OUTCOME[k] ?? k, value: v, color: OUTCOME_COLOR[k] }))} empty="No books lent in the last 12 months." />}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Most borrowed books" icon={Trophy}>
          {popular.isLoading ? <Skeleton rows={4} className="h-8" /> : <Bars rows={(popular.data?.items ?? []).slice(0, 10).map(p => ({ label: p.title, value: p.borrowCount }))} empty="No books were borrowed in these dates." />}
        </Panel>
        <Panel title="Copies by status" icon={Copy}>
          {copies.isLoading ? <Skeleton rows={4} className="h-8" /> : <DonutChart title="Copies by status" centerLabel="copies" data={(copies.data ?? []).map(c => ({ label: c.status.charAt(0) + c.status.slice(1).toLowerCase(), value: c.count, color: STATUS_COLOR[c.status] }))} empty="No copies recorded." />}
        </Panel>
      </div>

      <Panel title="Borrowed this school week (Monday to Friday)" icon={CalendarDays} action={week.data ? <span className="text-sm text-ink-muted">{phDate(`${week.data.from}T12:00:00+08:00`)} – {phDate(`${week.data.to}T12:00:00+08:00`)}</span> : undefined}>
        {week.isLoading ? <Skeleton rows={3} className="h-10" /> : week.isError || !week.data ? <p role="alert" className="text-danger text-sm">Could not load this week.</p> : (
          <div className="space-y-5">
            <ColumnChart title="Books per day this week" labels={week.data.days.map(d => weekday(d.day))}
              series={[{ name: "Borrowed", values: week.data.days.map(d => d.borrowed), color: "#3354B5" }, { name: "Returned", values: week.data.days.map(d => d.returned), color: "#15803D" }, { name: "Library visits", values: week.data.days.map(d => d.visits), color: "#D97706" }]} />
            {!week.data.loans.length ? <p className="text-sm text-ink-muted text-center py-4">No books borrowed yet this week.</p> : (
              <div className={`${table.wrap} max-h-96 overflow-y-auto`}>
                <table className={table.table}>
                  <thead className={`${table.head} sticky top-0`}><tr>{["Day", "Member ID", "Grade & section / Department", "Book borrowed", "Copy"].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                  <tbody>{week.data.loans.map((l, i) => (
                    <tr key={i} className={table.row}>
                      <td className={`${table.td} text-ink-muted whitespace-nowrap`}>{weekday(l.day)} · {phDate(l.at).replace(/, \d{4}$/, "")}</td>
                      <td className={`${table.td} font-mono font-bold text-primary-strong`}>{l.memberId ?? "—"}</td>
                      <td className={`${table.td} text-ink-muted`}>{l.group ?? "—"}</td>
                      <td className={`${table.td} font-semibold text-ink`}>{l.title}</td>
                      <td className={`${table.td} font-mono text-xs text-ink-muted`}>{l.copy}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Top active members" icon={Medal} action={<Segmented<Period> label="Period" value={period} onChange={setPeriod} options={[{ key: "day", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }]} />}>
        <p className="text-sm text-ink-muted mb-3">Points: 3 per book borrowed, 2 per written review, 1 per library visit. Shown by Member ID only. Print it from Printing &gt; Top active members.</p>
        <TopMembersTable q={top} />
      </Panel>

      <Panel title={`Overdue books${overdue.data ? ` (${overdue.data.total})` : ""}`} icon={AlertTriangle} action={<Link to={`${txPath}?tab=borrowed`} className={btn.ghost}>Send notices</Link>}>
        {overdue.isLoading ? <Skeleton rows={3} className="h-10" /> : !overdue.data?.items.length ? <p className="text-sm text-ink-muted py-6 text-center">No overdue books.</p> : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className={table.head}><tr>{["Book", "Member ID", "Due", "Days overdue"].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
              <tbody>
                {overdue.data.items.map(o => (
                  <tr key={o.id} className={table.row}>
                    <td className={`${table.td} font-semibold text-ink`}>{o.bookCopy?.book?.title}</td>
                    <td className={`${table.td} font-mono font-bold text-primary-strong`}>{o.borrower?.maskedId ?? "—"}</td>
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

/** Ranking of the most active members (photo, Member ID, section; never names). */
export function TopMembersTable({ q }: { q: { isLoading: boolean; isError: boolean; data?: { items: TopMember[] } } }) {
  if (q.isLoading) return <Skeleton rows={4} className="h-10" />;
  if (q.isError || !q.data) return <p role="alert" className="text-danger text-sm">Could not load the ranking.</p>;
  if (!q.data.items.length) return <p className="text-sm text-ink-muted text-center py-6">No activity in this period yet.</p>;
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead className={table.head}><tr>{["#", "Member", "Borrowed", "Reviews", "Visits", "Points", "Books"].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
        <tbody>{q.data.items.map((m, i) => (
          <tr key={m.memberId} className={table.row}>
            <td className={table.td}><span className={`w-8 h-8 rounded-full inline-flex items-center justify-center text-sm font-extrabold ${i === 0 ? "bg-accent text-on-accent" : i < 3 ? "bg-primary-soft text-primary" : "text-ink-muted"}`}>{i + 1}</span></td>
            <td className={table.td}><div className="flex items-center gap-3"><MemberAvatar m={{ username: m.maskedId ?? "?", avatarUrl: m.avatarUrl, maskedId: m.maskedId }} /><div><div className="font-mono font-bold text-primary-strong">{m.maskedId ?? "—"}</div><div className="text-xs text-ink-muted">{m.group ?? m.memberType ?? "—"}</div></div></div></td>
            <td className={`${table.td} tabular-nums`}>{m.borrows}</td>
            <td className={`${table.td} tabular-nums`}>{m.reviews}</td>
            <td className={`${table.td} tabular-nums`}>{m.visits}</td>
            <td className={`${table.td} tabular-nums font-bold text-ink`}>{m.score}</td>
            <td className={`${table.td} text-xs text-ink-muted`}>{m.books.join(" · ") || "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
