import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, CheckCircle2, Undo2, CalendarCheck } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { Badge, EmptyState, SearchField, Skeleton, StaffDialog, btn, btnSm, select, table } from "../../components/staff/ui";
import { phDate } from "../../lib/dates";

interface Row { id: string; title: string; subject: string | null; code: string | null; condition: string | null; schoolYear: string; status: "ISSUED" | "RETURNED"; checkedAt: string | null; returnedAt: string | null; createdAt: string; memberId: string | null; group: string | null }

/**
 * Borrowing > School-issued books: the books the school gave members for the school year, as each member typed them
 * on the phone (no limit). Check each one, and record the returns at the end of the school year.
 */
export function IssuedBooks() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "ISSUED" | "RETURNED">("");
  const [year, setYear] = useState("");
  const [endYear, setEndYear] = useState(false);
  const canWrite = hasPerm("circulation:write");
  const list = useQuery({
    queryKey: ["issued", q, status, year],
    queryFn: async () => {
      const qs = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}), ...(year ? { schoolYear: year } : {}) });
      const r = await apiFetch(`/api/v1/issued-books?${qs}`, { token });
      if (!r.ok) throw new Error(r.message);
      return r.data as { schoolYear: string; years: string[]; items: Row[] };
    },
    enabled: !!token,
  });
  const sy = list.data?.schoolYear ?? year;
  const patch = async (r: Row, body: object, done: string) => {
    const res = await apiFetch(`/api/v1/issued-books/${r.id}`, { method: "PATCH", token, body: JSON.stringify(body) });
    if (!res.ok) { toast({ tone: "error", title: "Not saved", message: res.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: done, message: `"${r.title}" · ${r.memberId ?? ""}` });
    void qc.invalidateQueries({ queryKey: ["issued"] });
  };
  const returnAll = async () => {
    const res = await apiFetch("/api/v1/issued-books/return-all", { method: "POST", token, body: JSON.stringify({ schoolYear: sy }) });
    setEndYear(false);
    if (!res.ok) { toast({ tone: "error", title: "Not saved", message: res.message ?? "Please try again." }); return; }
    toast({ tone: "success", title: "School year closed", message: `${(res.data as { returned: number }).returned} book(s) of ${sy} marked returned.` });
    void qc.invalidateQueries({ queryKey: ["issued"] });
  };
  const items = list.data?.items ?? [];
  const holding = items.filter(i => i.status === "ISSUED").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Books the school gave members for the school year (e.g. textbooks). Members type each one in the app; check them here and record the return at the end of the school year.</p>
      <div className="flex flex-wrap items-start gap-3">
        <SearchField id="issued-search" label="Search school-issued books" value={q} onChange={setQ} placeholder="Search title, code, subject or Member ID" />
        <label htmlFor="issued-year" className="sr-only">School year</label>
        <select id="issued-year" value={sy} onChange={e => setYear(e.target.value)} className={`${select} !w-auto !rounded-full`}>{(list.data?.years ?? [sy]).filter(Boolean).map(y => <option key={y}>{y}</option>)}</select>
        <label htmlFor="issued-status" className="sr-only">Status</label>
        <select id="issued-status" value={status} onChange={e => setStatus(e.target.value as typeof status)} className={`${select} !w-auto !rounded-full`}><option value="">With members and returned</option><option value="ISSUED">With members</option><option value="RETURNED">Returned</option></select>
        {canWrite && holding > 0 && <button type="button" onClick={() => setEndYear(true)} className={btn.secondary}><CalendarCheck size={16} aria-hidden="true" />End of school year</button>}
      </div>
      {list.isLoading ? <Skeleton rows={4} /> : list.isError ? <p role="alert" className="text-danger">Could not load the list.</p> : !items.length ? <EmptyState icon={Backpack} text={q ? "No books match your search." : `No school-issued books recorded for ${sy} yet.`} /> : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead className={table.head}><tr>{["Member ID", "Book", "Code / condition", "Added", "Status"].map(h => <th key={h} className={table.th}>{h}</th>)}<th className={`${table.th} text-right`}>Actions</th></tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className={table.row}>
                <td className={table.td}><div className="font-mono font-bold text-primary-strong">{r.memberId ?? "—"}</div><div className="text-xs text-ink-muted">{r.group ?? ""}</div></td>
                <td className={table.td}><div className="font-semibold text-ink">{r.title}</div><div className="text-xs text-ink-muted">{r.subject ?? ""}</div></td>
                <td className={`${table.td} text-xs text-ink-muted`}>{[r.code, r.condition].filter(Boolean).join(" · ") || "—"}</td>
                <td className={`${table.td} text-ink-muted whitespace-nowrap`}>{phDate(r.createdAt)}</td>
                <td className={table.td}>{r.status === "RETURNED" ? <Badge tone="primary">Returned {r.returnedAt ? phDate(r.returnedAt) : ""}</Badge> : r.checkedAt ? <Badge tone="success">Checked</Badge> : <Badge tone="warning">Not checked</Badge>}</td>
                <td className={table.td}>
                  {canWrite && <div className="flex justify-end gap-2">
                    {r.status === "ISSUED" && <button type="button" onClick={() => void patch(r, { checked: !r.checkedAt }, r.checkedAt ? "Check removed" : "Book checked")} className={`${btn.secondary} ${btnSm}`}><CheckCircle2 size={14} aria-hidden="true" />{r.checkedAt ? "Uncheck" : "Check"}</button>}
                    <button type="button" onClick={() => void patch(r, { status: r.status === "ISSUED" ? "RETURNED" : "ISSUED" }, r.status === "ISSUED" ? "Marked returned" : "Back with the member")} className={`${btn.secondary} ${btnSm}`}><Undo2 size={14} aria-hidden="true" />{r.status === "ISSUED" ? "Returned" : "Undo return"}</button>
                  </div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <StaffDialog open={endYear} onClose={() => setEndYear(false)} title="End of the school year?" subtitle={sy} icon={CalendarCheck} onSubmit={e => { e.preventDefault(); void returnAll(); }}
        footer={<><button type="button" onClick={() => setEndYear(false)} className={btn.secondary}>Cancel</button><button type="submit" className={btn.primary}>Mark all returned</button></>}>
        <p className="text-sm text-ink">All {holding} school-issued book(s) still with members in {sy} will be marked returned. Do this after the books are back in the library.</p>
      </StaffDialog>
    </div>
  );
}
