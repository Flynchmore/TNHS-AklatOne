import { useEffect, useState } from "react";
import { withRule, type Rule } from "../../lib/inputRules";
import { GRADE_SECTION, GRADE_SECTION_ERROR, GRADE_SECTION_HINT, formatGradeSection } from "../../lib/gradeSection";
import { USERNAME_TIP, USERNAME_WARNING, looksLikeRealName } from "../../lib/username";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Pencil, Eye, UserX, UserCheck, ChevronLeft, ChevronRight, GraduationCap, Briefcase, Mail, Eye as EyeIcon, EyeOff, IdCard, KeyRound, Printer, Timer } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { RefreshButton } from "../../components/RefreshButton";
import { Badge, EmptyState, FormSection, PageHeader, Segmented, Skeleton, StaffDialog, btn, btnSm, input, label, table, select, SearchField } from "../../components/staff/ui";
import { StrengthMeter, loanStatus, passwordStrength } from "../../components/mobile/ui";
import { phDate } from "../../lib/dates";
import { fmtDuration } from "../../components/mobile/screenTime";
import { queuedToast } from "../../lib/offline";

export interface Member {
  id: string; username: string; displayName?: string | null; email?: string | null; memberType?: string | null;
  gradeSection?: string | null; department?: string | null; position?: string | null; gender?: string | null; studentRowNo?: number | null;
  isActive: boolean; createdAt: string; updatedAt?: string; activeLoans?: number; totalLoans?: number; avatarUrl?: string | null;
  maskedId?: string | null; cardPrintedAt?: string | null;
}

/**
 * For privacy the Members list and View show a member by Member ID, not by name (developer decision 2026-11-25):
 * students with their grade and section, teachers with their department / designation.
 */
const memberId = (m: { maskedId?: string | null }) => m.maskedId || "No Member ID yet";
const memberGroup = (m: { memberType?: string | null; gradeSection?: string | null; department?: string | null; position?: string | null }) =>
  (m.memberType === "Teacher" ? [m.department, m.position].filter(Boolean).join(" · ") : m.gradeSection) || (m.memberType === "Teacher" ? "Department not set" : "Section not set");

/** Member photo from the mobile app, or their initial when they have not set one. */
export function MemberAvatar({ m, size = "w-10 h-10 text-base" }: { m: Pick<Member, "username" | "avatarUrl" | "maskedId">; size?: string }) {
  return m.avatarUrl
    ? <img src={m.avatarUrl} alt="" className={`${size} rounded-full object-cover shrink-0 ring-2 ring-surface shadow-sm`} />
    : <span className={`${size} rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary font-bold flex items-center justify-center shrink-0`} aria-hidden="true">{(m.maskedId || m.username).charAt(0).toUpperCase()}</span>;
}
type TypeFilter = "all" | "Student" | "Teacher";
type StatusFilter = "active" | "inactive" | "all";
const PAGE = 20;

/** Staff "Members": librarians add, edit, deactivate and look up member (student/teacher) accounts. */
export function Members() {
  const { token, hasPerm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const canWrite = hasPerm("users:write");
  const [q, setQ] = useState(() => params.get("q") ?? "");
  useEffect(() => { const v = params.get("q"); if (v !== null) setQ(v); }, [params]); // global search opening this page again
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [viewing, setViewing] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (params.get("new") === "1" && canWrite) { setEditing("new"); setParams({}, { replace: true }); } }, [params, setParams, canWrite]);

  const list = useQuery({
    queryKey: ["members", search, type, status, page],
    // Keeps the borrowed-books tally in step with the desk and the members' apps.
    refetchInterval: 30_000,
    queryFn: async () => {
      const qs = new URLSearchParams({ q: search, status, limit: String(PAGE), offset: String(page * PAGE), ...(type !== "all" ? { memberType: type } : {}) });
      const r = await apiFetch(`/api/v1/users?${qs}`, { token });
      if (!r.ok) throw new Error(r.message);
      return r.data as { items: Member[]; total: number };
    },
    enabled: !!token,
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE));

  const toggle = useMutation({
    mutationFn: async (m: Member) => {
      const r = await apiFetch(`/api/v1/users/${m.id}/status`, { method: "PATCH", body: JSON.stringify({ isActive: !m.isActive }), token, ...(m.updatedAt ? { headers: { "X-Expected-Updated-At": m.updatedAt } } : {}), offline: { kind: "member", label: `${m.isActive ? "Deactivate" : "Activate"} ${memberId(m)}` } });
      if (!r.ok) throw new Error(r.message ?? "Could not change the status");
      return { ...m, queued: r.queued };
    },
    onSuccess: (m) => {
      toast(m.queued ? queuedToast : m.isActive
        ? { tone: "info", title: "Member deactivated", message: `${memberId(m)} can no longer sign in.` }
        : { tone: "success", title: "Member activated", message: `${memberId(m)} can sign in again.` });
      setConfirm(null);
      ["members", "summary", "recent-activity"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast({ tone: "error", title: "Status not changed", message: (e as Error).message }),
  });

  return (
    <div className="space-y-6">
      <PageHeader icon={Users} title="Members" subtitle="Students and teachers who use the AklatOne mobile app."
        actions={<>
          <RefreshButton what="members" onRefresh={async () => { const r = await list.refetch(); return { isError: r.isError, data: r.data?.items }; }} />
          {canWrite && <button type="button" onClick={() => setEditing("new")} className={btn.success}><UserPlus size={18} aria-hidden="true" />Add member</button>}
        </>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField id="members-search" label="Search members" value={q} onChange={setQ} placeholder="Search name, username, email, section or Member ID" className="max-w-lg" />
        <Segmented label="Role" value={type} onChange={t => { setType(t); setPage(0); }} options={[{ key: "all", label: "All" }, { key: "Student", label: "Students" }, { key: "Teacher", label: "Teachers" }]} />
        <label htmlFor="members-status" className="sr-only">Account status</label>
        <select id="members-status" value={status} onChange={e => { setStatus(e.target.value as StatusFilter); setPage(0); }} className={`${select} !w-auto !rounded-full`}>
          <option value="active">Active accounts</option>
          <option value="inactive">Deactivated</option>
          <option value="all">All accounts</option>
        </select>
      </div>

      {list.isLoading && <Skeleton rows={5} />}
      {list.isError && <p role="alert" className="text-danger">Could not load members. <button className="underline" onClick={() => list.refetch()}>Try again</button></p>}
      {list.data && list.data.items.length === 0 && <EmptyState icon={Users} text={search ? `No members match "${search}".` : "No members here yet."} action={canWrite ? <button type="button" onClick={() => setEditing("new")} className={btn.primary}><UserPlus size={16} aria-hidden="true" />Add member</button> : undefined} />}

      {list.data && list.data.items.length > 0 && (
        <div className={`${table.wrap}`}>
          <table className={table.table}>
            <thead className={table.head}><tr>{["Member", "Role", "Email", "Borrowed", "Status"].map(h => <th key={h} className={table.th}>{h}</th>)}<th className={`${table.th} text-right`}>Actions</th></tr></thead>
            <tbody>
              {list.data.items.map(m => (
                <tr key={m.id} className={table.row}>
                  <td className={table.td}>
                    <div className="flex items-center gap-3">
                      <MemberAvatar m={m} />
                      <div className="min-w-0"><div className="font-mono font-bold text-primary">{memberId(m)}</div><div className="text-xs text-ink-muted">{memberGroup(m)}</div></div>
                    </div>
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {m.memberType ? <Badge tone={m.memberType === "Teacher" ? "warning" : "primary"}>{m.memberType === "Teacher" ? <Briefcase size={12} aria-hidden="true" /> : <GraduationCap size={12} aria-hidden="true" />}{m.memberType}</Badge> : <span className="text-ink-muted text-xs">Not set</span>}
                  </td>
                  <td className={`${table.td} text-xs text-ink-muted`}>{m.email && <div className="flex items-center gap-1"><Mail size={12} aria-hidden="true" />{m.email}</div>}{!m.email && "—"}</td>
                  <td className={`${table.td} tabular-nums`}><span className="text-ink font-semibold">{m.activeLoans ?? 0} now</span><div className="text-xs text-ink-muted">{m.totalLoans ?? 0} in all</div></td>
                  <td className={table.td}><Badge tone={m.isActive ? "success" : "muted"}>{m.isActive ? "Active" : "Deactivated"}</Badge></td>
                  <td className={table.td}>
                    {confirm === m.id ? (
                      <div className="flex flex-wrap justify-end gap-2 ak-fade">
                        <span className="text-xs text-ink-muted self-center">{m.isActive ? "Deactivate?" : "Activate?"}</span>
                        <button className={`${m.isActive ? btn.danger : btn.success} ${btnSm}`} disabled={toggle.isPending} onClick={() => toggle.mutate(m)}>Yes</button>
                        <button className={`${btn.ghost} ${btnSm}`} onClick={() => setConfirm(null)}>No</button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button className={`${btn.secondary} ${btnSm}`} onClick={() => setViewing(m)} aria-label={`View ${memberId(m)}`}><Eye size={14} aria-hidden="true" />View</button>
                        {canWrite && <button className={`${btn.secondary} ${btnSm}`} onClick={() => setEditing(m)} aria-label={`Edit ${memberId(m)}`}><Pencil size={14} aria-hidden="true" />Edit</button>}
                        {canWrite && <button className={`${btn.secondary} ${btnSm} ${m.isActive ? "!text-danger hover:!border-danger hover:!bg-danger-soft" : "!text-success hover:!border-success hover:!bg-success-soft"}`} onClick={() => setConfirm(m.id)} aria-label={`${m.isActive ? "Deactivate" : "Activate"} ${memberId(m)}`}>{m.isActive ? <UserX size={14} aria-hidden="true" /> : <UserCheck size={14} aria-hidden="true" />}</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.data && pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          <button className={`${btn.secondary} ${btnSm}`} disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
          <span className="text-sm text-ink-muted">Page {page + 1} of {pages}</span>
          <button className={`${btn.secondary} ${btnSm}`} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
        </nav>
      )}

      <MemberDialog member={editing} onClose={() => setEditing(null)} onSaved={() => ["members", "summary", "recent-activity"].forEach(k => qc.invalidateQueries({ queryKey: [k] }))} />
      <MemberDetails member={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

type Form = { displayName: string; username: string; memberType: "Student" | "Teacher"; email: string; gradeSection: string; studentRowNo: string; department: string; position: string; gender: string; password: string };
const blank: Form = { displayName: "", username: "", memberType: "Student", email: "", gradeSection: "", studentRowNo: "", department: "", position: "", gender: "", password: "" };

function MemberDialog({ member, onClose, onSaved }: { member: Member | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const toast = useToast();
  const isNew = member === "new";
  const [form, setForm] = useState<Form>(blank);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setError(""); setShow(false);
    setForm(member === "new" ? blank : {
      displayName: member.displayName ?? "", username: member.username, memberType: member.memberType === "Teacher" ? "Teacher" : "Student",
      email: member.email ?? "", gradeSection: member.gradeSection ? formatGradeSection(member.gradeSection) : "", studentRowNo: member.studentRowNo ? String(member.studentRowNo) : "",
      department: member.department ?? "", position: member.position ?? "", gender: member.gender === "Male" || member.gender === "Female" ? member.gender : "", password: "",
    });
  }, [member]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const student = form.memberType === "Student";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.displayName.trim() || (isNew && !form.username.trim())) { setError("Name and username are required."); return; }
    // Every account needs an email: sign-in codes (2FA), activation and password codes go there.
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError("A valid email is required for every member."); return; }
    if (student && form.gradeSection.trim() && !GRADE_SECTION.test(form.gradeSection.trim())) { setError(GRADE_SECTION_ERROR); return; }
    if ((isNew || form.password) && passwordStrength(form.password).score < 3) { setError("Please use a stronger password (12+ characters, mixed case, numbers, symbols)."); return; }
    setSaving(true); setError("");
    const { username, password, studentRowNo, ...rest } = form;
    const body = {
      ...rest,
      ...(student ? { department: "", position: "", studentRowNo: studentRowNo || null } : { gradeSection: "", studentRowNo: null }),
      ...(isNew ? { username: username.trim() } : {}),
      ...(password ? { password } : {}),
    };
    const expected = !isNew && (member as Member).updatedAt ? { "X-Expected-Updated-At": (member as Member).updatedAt! } : undefined;
    const r = await apiFetch(isNew ? "/api/v1/users" : `/api/v1/users/${(member as Member).id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(body), token, ...(expected ? { headers: expected } : {}), offline: { kind: "member", label: `${isNew ? "Add" : "Edit"} member ${form.displayName.trim()}` } });
    setSaving(false);
    if (r.queued) { toast(queuedToast); onClose(); return; }
    if (!r.ok) {
      const details = (r.data as { errors?: { fieldErrors?: Record<string, string[]> } } | null)?.errors?.fieldErrors;
      const msg = details ? Object.entries(details).map(([k, v]) => `${k}: ${v.join(", ")}`).join(" · ") : r.message ?? "Could not save the member.";
      setError(msg);
      toast({ tone: "error", title: "Member not saved", message: msg });
      return;
    }
    toast({ tone: "success", title: isNew ? "Member added" : "Member updated", message: isNew ? `${form.displayName.trim()} can now sign in as @${username.trim()}.${form.email ? " A welcome email was sent." : ""}` : `${form.displayName.trim()}'s details were saved.` });
    onSaved();
    onClose();
  };

  const field = (text: string, k: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}, rule?: Rule) => (
    <div>
      <label htmlFor={`member-${k}`} className={label}>{text}</label>
      <input id={`member-${k}`} value={form[k]} onChange={withRule(rule, set(k))} className={input} {...props} />
    </div>
  );

  return (
    <StaffDialog open={!!member} onClose={onClose} title={isNew ? "Add member" : "Edit member"} subtitle={isNew ? "New student or teacher account for the mobile app" : `@${form.username}`} icon={isNew ? UserPlus : Pencil} wide onSubmit={save}
      footer={<>
        <button type="button" onClick={onClose} className={btn.secondary}>Cancel</button>
        <button type="submit" disabled={saving} className={btn.primary}>{saving ? "Saving…" : isNew ? "Add member" : "Save changes"}</button>
      </>}
    >
      {error && <p role="alert" className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-2xl p-3">{error}</p>}
      <FormSection title="Role *" icon={student ? GraduationCap : Briefcase}>
        <Segmented label="Role" value={form.memberType} onChange={t => setForm(f => ({ ...f, memberType: t }))} options={[{ key: "Student", label: "Student" }, { key: "Teacher", label: "Teacher" }]} />
        <p className="text-xs text-ink-muted">Only the details for the chosen role are asked and shown.</p>
      </FormSection>
      <FormSection title="Personal information" icon={IdCard}>
        <div className="grid sm:grid-cols-2 gap-4">
          {field("Full name *", "displayName", { maxLength: 100, autoComplete: "off" }, "name")}
          {isNew ? (
            <div>
              {field("Username *", "username", { maxLength: 50, autoCapitalize: "none", autoComplete: "off", placeholder: "e.g. reader2026", "aria-describedby": "member-username-tip" }, "username")}
              <p id="member-username-tip" className={`text-xs mt-1 ${looksLikeRealName(form.username, form.displayName) ? "text-warning font-semibold" : "text-ink-muted"}`}>{looksLikeRealName(form.username, form.displayName) ? USERNAME_WARNING : USERNAME_TIP}</p>
            </div>
          ) : (
            <div><p className={label}>Username</p><p className="min-h-11 flex items-center px-4 rounded-2xl bg-page text-ink-muted text-sm">@{form.username}</p></div>
          )}
          {field("Email (required)", "email", { type: "email", maxLength: 191, autoComplete: "off", required: true }, "email")}
          <div>
            <label htmlFor="member-gender" className={label}>Sex</label>
            <select id="member-gender" value={form.gender} onChange={set("gender")} className={select}>
              <option value="">Not set</option><option>Male</option><option>Female</option>
            </select>
          </div>
        </div>
      </FormSection>
      <FormSection title={student ? "Student details" : "Teacher details"} icon={student ? GraduationCap : Briefcase}>
        <div key={form.memberType} className="grid sm:grid-cols-2 gap-4 ak-fade">
          {student ? (
            <>
              {field("Grade & section", "gradeSection", { maxLength: 50, placeholder: "e.g. 10 - Archimedes", title: GRADE_SECTION_HINT, onChange: e => { const v = e.target.value; setForm(f => ({ ...f, gradeSection: formatGradeSection(v, f.gradeSection) })); } })}
              {field("Class record no.", "studentRowNo", { inputMode: "numeric", maxLength: 3, placeholder: "1 to 999" }, "digits")}
            </>
          ) : (
            <>
              {field("Department", "department", { maxLength: 100, placeholder: "e.g. Science" }, "words")}
              {field("Position", "position", { maxLength: 100, placeholder: "e.g. Teacher III" }, "words")}
            </>
          )}
        </div>
      </FormSection>
      <FormSection title="Sign-in" icon={KeyRound}>
        <div>
          <label htmlFor="member-password" className={label}>{isNew ? "First password *" : "New password (leave blank to keep)"}</label>
          <div className="relative">
            <input id="member-password" maxLength={128} type={show ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="new-password" className={`${input} pr-12`} />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-ink-muted hover:text-primary hover:bg-primary-soft">{show ? <EyeOff size={18} aria-hidden="true" /> : <EyeIcon size={18} aria-hidden="true" />}</button>
          </div>
          <StrengthMeter password={form.password} />
          <p className="text-xs text-ink-muted mt-1">Give this to the member privately. They can change it in the app under Settings.</p>
        </div>
      </FormSection>
    </StaffDialog>
  );
}

interface Detail extends Member { borrowed: { id: string; status: string; outcome?: string | null; receiptNo?: string | null; borrowedAt: string; dueAt?: string | null; returnedAt?: string | null; bookCopy: { book: { title: string } } }[] }

function MemberDetails({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { token } = useAuth();
  const time = useQuery({
    queryKey: ["member-time", member?.id],
    queryFn: async () => { const r = await apiFetch(`/api/v1/time/members/${member!.id}`, { token }); if (!r.ok) throw new Error(r.message); return r.data as { app: { totalSeconds: number; days: { seconds: number }[] }; library: { visits: number; seconds: number; averageSeconds: number | null; insideNow: boolean }; loans: { returned: number; averageDays: number | null } }; },
    enabled: !!member && !!token,
  });
  const detail = useQuery({
    queryKey: ["member", member?.id],
    queryFn: async () => { const r = await apiFetch(`/api/v1/users/${member!.id}`, { token }); if (!r.ok) throw new Error(r.message); return r.data as Detail; },
    enabled: !!member && !!token,
  });
  const m = detail.data ?? member;
  const teacher = m?.memberType === "Teacher";
  // Each role only shows its own details.
  const personal: [string, string | number | null | undefined][] = m ? [["Member ID", m.maskedId], ["Library ID card", m.cardPrintedAt ? `Printed ${phDate(m.cardPrintedAt)}` : "Not printed yet"], ["Username", `@${m.username}`], ["Role", m.memberType || "Not set"], ["Email", m.email], ["Sex", m.gender === "Male" || m.gender === "Female" ? m.gender : null], ["Member since", phDate(m.createdAt)]] : [];
  const roleRows: [string, string | number | null | undefined][] = !m ? [] : teacher ? [["Department", m.department], ["Position", m.position]] : m.memberType === "Student" ? [["Grade & section", m.gradeSection], ["Class record no.", m.studentRowNo]] : [];
  const list = (rows: [string, string | number | null | undefined][]) => (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {rows.map(([k, v]) => <div key={k}><dt className="text-ink-muted text-xs font-semibold uppercase tracking-wide">{k}</dt><dd className="text-ink font-medium">{v || "—"}</dd></div>)}
    </dl>
  );
  return (
    <StaffDialog open={!!member} onClose={onClose} title={m ? memberId(m) : "Member"} subtitle={m ? memberGroup(m) : undefined} icon={teacher ? Briefcase : GraduationCap} wide>
      {m && (
        <>
          <div className="flex items-center gap-4">
            <MemberAvatar m={m} size="w-20 h-20 text-2xl" />
            <div className="space-y-1"><p className="text-xl font-mono font-bold text-primary">{memberId(m)}</p><div className="flex gap-2"><Badge tone={teacher ? "warning" : "primary"}>{m.memberType || "Role not set"}</Badge><Badge tone={m.isActive ? "success" : "muted"}>{m.isActive ? "Active" : "Deactivated"}</Badge></div></div>
          </div>
          <FormSection title="Personal information" icon={IdCard}>
            {list(personal)}
            {m.maskedId && <Link to={`/printing?card=${m.id}`} className={`${btn.secondary} ${btnSm} w-fit`}><Printer size={14} aria-hidden="true" />Print Library ID</Link>}
          </FormSection>
          {roleRows.length > 0 && <FormSection title={teacher ? "Teacher details" : "Student details"} icon={teacher ? Briefcase : GraduationCap}>{list(roleRows)}</FormSection>}
          {time.data && <FormSection title="Time spent" icon={Timer}>{list([
            ["Library visits", `${time.data.library.visits}${time.data.library.insideNow ? " (inside now)" : ""}`],
            ["Time in the library", `${fmtDuration(time.data.library.seconds)}${time.data.library.averageSeconds !== null ? ` · ${fmtDuration(time.data.library.averageSeconds)} per visit` : ""}`],
            ["Time in the app", `${fmtDuration(time.data.app.days.reduce((s, d) => s + d.seconds, 0))} this week · ${fmtDuration(time.data.app.totalSeconds)} in all`],
            ["Books kept on average", time.data.loans.averageDays === null ? "No returned books yet" : `${time.data.loans.averageDays} days (${time.data.loans.returned} returned)`],
          ])}</FormSection>}
          <div>
            <h3 className="font-bold text-primary-strong mb-2">Recent borrowing</h3>
            {detail.isLoading ? <Skeleton rows={2} className="h-10" /> : !detail.data?.borrowed.length ? <p className="text-sm text-ink-muted">No borrowed books yet.</p> : (
              <ul className="space-y-2">
                {detail.data.borrowed.map(t => { const st = loanStatus(t); return (
                  <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-page">
                    <div className="min-w-0"><p className="text-sm font-semibold text-ink truncate">{t.bookCopy.book.title}</p><p className="text-xs text-ink-muted">Borrowed {phDate(t.borrowedAt)}{t.receiptNo ? ` · ${t.receiptNo}` : ""}</p></div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${st.cls}`}>{st.text}</span>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        </>
      )}
    </StaffDialog>
  );
}
