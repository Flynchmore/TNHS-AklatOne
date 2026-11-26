import { useState, useEffect, useRef, useCallback } from "react";
import { USERNAME_TIP, USERNAME_WARNING, looksLikeRealName } from "../../lib/username";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/auth";
import { HistoryCard, HistoryEmpty, useHistory, type Tx } from "./MobileHistory";
import { useToast } from "../../components/Toast";
import {
  User as UserIcon, Camera, Save, LogOut, CircleUser, History as HistoryIcon, UserCog, BookCheck, BookOpenCheck, AlertTriangle, Mail,
  GraduationCap, Briefcase, Settings, BarChart3, ChevronRight, Pencil, Hash, Users, X, IdCard, Building2, Award, Heart, Smartphone, Clock, CheckCircle2, BookX, SearchX, CalendarDays, QrCode, Library, LogIn, Target,
} from "lucide-react";
import { Alert, Field, ListState, MemberTypePicker, ScreenShell, SlidingTabs, Spinner, btnPrimary, btnSecondary, focusRing, mobileApi, useSlideDirection, type MemberType, type TabDef } from "../../components/mobile/ui";
import { PhotoCropper } from "../../components/mobile/PhotoCropper";
import { SplineArea } from "../../components/SplineArea";
import { fmtDuration, lastDays, readUsage } from "../../components/mobile/screenTime";
import { phISODate } from "../../lib/dates";
import { GRADE_SECTION, GRADE_SECTION_ERROR, GRADE_SECTION_HINT, formatGradeSection } from "../../lib/gradeSection";

interface Details { displayName?: string | null; username: string; email?: string | null; avatarUrl?: string | null; memberType?: string | null; gradeSection?: string | null; department?: string | null; position?: string | null; hobbies?: string | null; gender?: string | null; studentRowNo?: number | null; role?: string; maskedId?: string | null; readingGoal?: number | null }
type Tab = "activity" | "account" | "stats";

/** Books borrowed per calendar month, oldest first (last `n` months). */
export function monthlyBorrows(txs: Tx[], now: number, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - (n - 1 - i));
    const value = txs.filter(t => { const b = t.borrowedAt ? new Date(t.borrowedAt) : null; return !!b && b.getFullYear() === d.getFullYear() && b.getMonth() === d.getMonth(); }).length;
    return { label: d.toLocaleDateString(undefined, { month: "short" }), value, display: `${value} book${value === 1 ? "" : "s"}` };
  });
}

/** How returned books came back. */
export function returnBreakdown(txs: Tx[]) {
  const done = txs.filter(t => t.status !== "ACTIVE");
  const late = done.filter(t => t.outcome === "RETURNED_LATE").length;
  const torn = done.filter(t => t.outcome === "DAMAGED").length;
  const missing = done.filter(t => t.outcome === "MISSING" || t.status === "LOST").length;
  return { total: done.length, onTime: done.length - late - torn - missing, late, torn, missing };
}

const daysKept = (txs: Tx[]) => {
  const spans = txs.filter(t => t.returnedAt && t.borrowedAt).map(t => (new Date(t.returnedAt!).getTime() - new Date(t.borrowedAt!).getTime()) / 86400000);
  return spans.length ? Math.max(1, Math.round(spans.reduce((a, b) => a + b, 0) / spans.length)) : null;
};

export function MobileProfile() {
  const auth = useAuth();
  const toast = useToast();
  const history = useHistory();
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("activity");
  const [me, setMe] = useState<Details | null>(auth.user ? { ...auth.user } as Details : null);
  const [crop, setCrop] = useState<File | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // /auth/me has every profile field (the sign-in response only has the basics).
  const loadMe = useCallback(() => {
    if (!auth.token) return;
    mobileApi("/api/v1/auth/me", { token: auth.token }).then(r => { if (r.ok && r.data) setMe(r.data as Details); });
  }, [auth.token]);
  useEffect(() => { loadMe(); }, [loadMe]);

  const patch = async (payload: Record<string, unknown>) => {
    const r = await mobileApi("/api/v1/auth/profile", { method: "PATCH", body: JSON.stringify(payload), token: auth.token });
    if (r.ok) { setMe(m => (m ? { ...m, ...payload } : m)); auth.updateUser?.(payload); }
    return r;
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCrop(file);
  };
  const closeCrop = () => setCrop(null);
  const savePhoto = async (dataUrl: string) => {
    setSavingPhoto(true);
    const r = await patch({ avatarUrl: dataUrl });
    setSavingPhoto(false);
    if (r.ok) { closeCrop(); toast({ tone: "success", title: "Photo updated", message: "Looking good!" }); }
    else toast({ tone: "error", title: "Photo not saved", message: r.status === 413 ? "That photo is too large. Please choose a smaller one." : r.message ?? "Please try again." });
  };

  const active = history.txs.filter(t => t.status === "ACTIVE");
  const tiles = [
    { label: "Borrowed now", value: active.length, Icon: BookOpenCheck, chip: "bg-primary-soft text-primary", to: "/m/loans" },
    { label: "Returned", value: history.txs.length - active.length, Icon: BookCheck, chip: "bg-success-soft text-success", to: "/m/history" },
    { label: "Overdue", value: active.filter(t => t.dueAt && new Date(t.dueAt).getTime() < now).length, Icon: AlertTriangle, chip: "bg-danger-soft text-danger", to: "/m/loans" },
  ];
  const tabs: TabDef<Tab>[] = [
    { key: "activity", label: "Activity", icon: HistoryIcon },
    { key: "account", label: "Account", icon: UserCog },
    { key: "stats", label: "Statistics", icon: BarChart3 },
  ];
  const direction = useSlideDirection(tabs.findIndex(t => t.key === tab));
  const memberType = (me?.memberType as MemberType) ?? "Student";
  const TypeIcon = memberType === "Teacher" ? Briefcase : GraduationCap;
  const name = me?.displayName || me?.username || auth.user?.username || "";

  const summary = (
    <section aria-label="Account summary" className="bg-surface rounded-3xl shadow-lg border border-line p-4">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          {me?.avatarUrl ? (
            <img src={me.avatarUrl} alt="Your profile photo" className="w-20 h-20 rounded-full object-cover ring-4 ring-primary-soft" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary flex items-center justify-center text-3xl font-bold ring-4 ring-primary-soft" aria-hidden="true">{name.charAt(0).toUpperCase() || "?"}</div>
          )}
          <label className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full bg-line text-primary-strong flex items-center justify-center cursor-pointer shadow-md ring-2 ring-surface hover:brightness-95 active:scale-90 transition focus-within:outline-none focus-within:ring-focus">
            <Camera size={18} aria-hidden="true" />
            <span className="sr-only">Change profile photo</span>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={pickFile} />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink text-lg leading-tight truncate">{name}</p>
          <p className="text-sm text-ink-muted flex items-center gap-1 min-w-0"><Mail size={14} className="shrink-0" aria-hidden="true" /><span className="truncate">{me?.email ?? "No email"}</span></p>
          <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold px-3 py-1 leading-tight rounded-full bg-primary-soft text-primary"><TypeIcon size={12} aria-hidden="true" />{memberType}</span>
        </div>
      </div>
      {/* Same look as Home's Quick Menu: white tiles with a soft icon; each opens the matching list. Overdue turns red when there is one. */}
      <ul className="grid grid-cols-3 gap-2.5 mt-4">
        {tiles.map(t => {
          const alert = t.label === "Overdue" && t.value > 0 && !history.loading;
          return (
            <li key={t.label}>
              <Link to={t.to} aria-label={`${history.loading ? "" : t.value} ${t.label}`} className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 shadow-sm active:scale-95 transition ${alert ? "bg-danger-soft border-danger/50" : "bg-surface border-line hover:border-primary/40"}`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.chip}`} aria-hidden="true"><t.Icon size={18} strokeWidth={2.2} /></span>
                <span className={`text-xl font-extrabold leading-none mt-1 ${alert ? "text-danger" : "text-ink"}`}>{history.loading ? "–" : t.value}</span>
                <span className="text-[11px] font-bold text-center leading-tight text-ink-muted">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const settingsButton = (
    <Link to="/m/settings" aria-label="Settings" className="w-12 h-12 shrink-0 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-on-primary active:scale-95 transition hover:rotate-45 motion-safe:duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
      <Settings size={22} aria-hidden="true" />
    </Link>
  );

  return (
    <ScreenShell title="Profile" subtitle="Your account and activity" icon={CircleUser} action={settingsButton} floating={summary}>
      <SlidingTabs label="Profile sections" tabs={tabs} active={tab} onChange={setTab} />

      <div key={tab} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={direction}>
        {tab === "activity" && (
          <>
          <ReadingGoal goal={me?.readingGoal ?? null} txs={history.txs} onSave={patch} />
          <section aria-labelledby="profile-history" className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 id="profile-history" className="font-semibold text-primary-strong">Recent borrowing</h2>
              {history.txs.length > 5 && <Link to="/m/history" className={`text-sm text-primary font-semibold min-h-8 inline-flex items-center rounded ${focusRing}`}>See all</Link>}
            </div>
            <ListState loading={history.loading && "Loading history…"} error={history.error} onRetry={history.load}>
              {history.txs.length === 0 ? <HistoryEmpty /> : <ul className="space-y-3">{history.txs.slice(0, 5).map(t => <HistoryCard key={t.id} t={t} now={now} />)}</ul>}
            </ListState>
          </section>
          </>
        )}
        {tab === "account" && me && <AccountPanel me={me} onSave={patch} />}
        {tab === "stats" && <StatsPanel txs={history.txs} loading={history.loading} userId={auth.user?.id} now={now} />}
      </div>

      <button type="button" onClick={() => setConfirmSignOut(true)} className={`group w-full flex items-center gap-3 p-3 pr-4 rounded-3xl bg-surface border border-line shadow-sm hover:border-danger/50 hover:shadow-md active:scale-[0.98] motion-safe:transition-all motion-safe:duration-200 ${focusRing}`}>
        <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-danger to-danger-strong text-on-primary flex items-center justify-center shadow-md shadow-danger/30 motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-0.5" aria-hidden="true"><LogOut size={20} /></span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-bold text-danger">Sign out</span>
          <span className="block text-xs text-ink-muted">Sign out of AklatOne on this phone</span>
        </span>
        <ChevronRight size={18} className="text-ink-muted motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </button>

      {confirmSignOut && <SignOutSheet onCancel={() => setConfirmSignOut(false)} onConfirm={() => {
        setConfirmSignOut(false);
        toast({ tone: "info", title: "Signed out", message: "See you again at the library!" });
        auth.logout();
      }} />}

      {crop && <PhotoCropper file={crop} saving={savingPhoto} onSave={savePhoto} onCancel={closeCrop} onPickAnother={() => fileRef.current?.click()} />}
    </ScreenShell>
  );
}

/** Bottom sheet asking the member to confirm signing out. */
function SignOutSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal?.(); }, []);
  return (
    <dialog ref={ref} onClose={onCancel} aria-labelledby="signout-title" className="mt-auto mb-0 mx-auto w-full max-w-lg p-0 rounded-t-3xl bg-surface text-ink backdrop:bg-black/50 ak-slide">
      <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center space-y-4">
        <div className="flex justify-center" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-slate-300" /></div>
        <span className="w-16 h-16 mx-auto rounded-full bg-danger-soft text-danger flex items-center justify-center ak-scale" aria-hidden="true"><LogOut size={28} /></span>
        <div>
          <h2 id="signout-title" className="text-lg font-bold text-ink">Sign out of AklatOne?</h2>
          <p className="text-sm text-ink-muted mt-1">You will need your username and password to sign in again.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className={btnSecondary} autoFocus><X size={16} aria-hidden="true" />Cancel</button>
          <button type="button" onClick={onConfirm} className={`w-full min-h-12 py-3 px-4 rounded-2xl font-semibold text-on-primary bg-gradient-to-br from-danger to-danger-strong shadow-lg shadow-danger/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] motion-safe:transition-all motion-safe:duration-200 flex items-center justify-center gap-2 ${focusRing}`}><LogOut size={16} aria-hidden="true" />Sign out</button>
        </div>
      </div>
    </dialog>
  );
}

/** Shows the member's details; "Update information" switches to an edit form. */
function AccountPanel({ me, onSave }: { me: Details; onSave: (p: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }> }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(me);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const type = (editing ? form.memberType : me.memberType) === "Teacher" ? "Teacher" : "Student";
  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const [rowNo, setRowNo] = useState("");
  const startEdit = () => { setForm({ ...me, gradeSection: me.gradeSection ? formatGradeSection(me.gradeSection) : me.gradeSection }); setRowNo(me.studentRowNo ? String(me.studentRowNo) : ""); setError(""); setEditing(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.username?.trim()) { setError("Username is required."); return; }
    if (type === "Student" && form.gradeSection?.trim() && !GRADE_SECTION.test(form.gradeSection.trim())) { setError(GRADE_SECTION_ERROR); return; }
    if (type === "Student" && rowNo !== "" && !(Number(rowNo) >= 1 && Number(rowNo) <= 999)) { setError("Student Row No. must be a number from 1 to 999."); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      displayName: form.displayName?.trim() ?? "", username: form.username.trim(), memberType: type,
      hobbies: form.hobbies?.trim() ?? "",
      gender: form.gender === "Male" || form.gender === "Female" ? form.gender : "",
      ...(type === "Student"
        ? { gradeSection: form.gradeSection?.trim() ?? "", studentRowNo: rowNo === "" ? null : Number(rowNo) }
        : { department: form.department?.trim() ?? "", position: form.position?.trim() ?? "" }),
    };
    const r = await onSave(payload);
    setSaving(false);
    if (!r.ok) { setError(r.message ?? "Could not save your information."); return; }
    setEditing(false);
    toast({ tone: "success", title: "Information updated", message: "Your profile details were saved." });
  };

  if (!editing) {
    const rows: { label: string; value?: string | null; Icon: typeof UserIcon }[] = [
      // Shown on the Library ID card and used at the library desk and the visitor log.
      { label: "Member ID", value: me.maskedId, Icon: QrCode },
      { label: "Full name", value: me.displayName, Icon: IdCard },
      { label: "Username", value: me.username, Icon: UserIcon },
      { label: "Email", value: me.email, Icon: Mail },
      { label: "Role", value: me.memberType, Icon: type === "Teacher" ? Briefcase : GraduationCap },
      { label: "Sex", value: me.gender === "Male" || me.gender === "Female" ? me.gender : null, Icon: Users },
      ...(type === "Student"
        ? [{ label: "Grade & section", value: me.gradeSection, Icon: GraduationCap }, { label: "Student Row No.", value: me.studentRowNo ? String(me.studentRowNo) : null, Icon: Hash }]
        : [{ label: "Department", value: me.department, Icon: Building2 }, { label: "Designation", value: me.position, Icon: Award }]),
      { label: "Favourites & hobbies", value: me.hobbies, Icon: Heart },
    ];
    return (
      <section aria-labelledby="acct-title" className="space-y-3">
        <div className="bg-surface rounded-3xl shadow-sm border border-line overflow-hidden">
          <h2 id="acct-title" className="px-5 pt-4 pb-2 font-semibold text-primary-strong">Personal information</h2>
          <dl className="divide-y divide-line">
            {rows.map(r => (
              <div key={r.label} className="flex items-start gap-3 px-5 py-3">
                <span className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0" aria-hidden="true"><r.Icon size={18} /></span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-ink-muted">{r.label}</dt>
                  <dd className={`text-sm break-words ${r.value ? "text-ink font-semibold" : "text-ink-muted italic"}`}>{r.value || "Not set"}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
        <button type="button" onClick={startEdit} className={btnPrimary}><Pencil size={16} aria-hidden="true" />Update information</button>
      </section>
    );
  }

  return (
    <form onSubmit={save} noValidate className="bg-surface rounded-3xl shadow-sm border border-line p-5 space-y-4 ak-scale">
      <h2 className="font-semibold text-primary-strong">Update information</h2>
      {error && <Alert>{error}</Alert>}
      <Field label="Full name" rule="name" icon={<IdCard size={18} />} autoComplete="name" value={form.displayName ?? ""} onChange={set("displayName")} maxLength={100} />
      <Field label="Username" rule="username" maxLength={50} icon={<UserIcon size={18} />} autoComplete="username" autoCapitalize="none" value={form.username} onChange={set("username")}
        hint={looksLikeRealName(form.username, form.displayName ?? "") ? `⚠ ${USERNAME_WARNING}` : USERNAME_TIP} />
      {/* Student or Teacher is chosen once; after that only the librarian can change it. */}
      {me.memberType ? (
        <p className="rounded-2xl bg-page border border-line px-4 py-3 text-sm text-ink"><b>Role:</b> {me.memberType} <span className="block text-xs text-ink-muted">Set once. Ask the librarian if it is wrong.</span></p>
      ) : (
        <MemberTypePicker value={type} onChange={v => setForm(f => ({ ...f, memberType: v }))} />
      )}
      <fieldset>
        <legend className="block text-sm font-medium text-ink mb-1.5">Sex</legend>
        <div className="grid grid-cols-2 gap-2">
          {["Male", "Female"].map(g => {
            const on = form.gender === g;
            return (
              <button key={g} type="button" aria-pressed={on} onClick={() => setForm(f => ({ ...f, gender: on ? "" : g }))}
                className={`min-h-11 px-2 rounded-xl text-xs font-semibold leading-tight motion-safe:transition-all motion-safe:duration-200 active:scale-95 ${focusRing} ${on ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "bg-surface border border-line-strong text-ink hover:border-primary"}`}>{g}</button>
            );
          })}
        </div>
      </fieldset>
      {type === "Student" ? (
        <>
          <Field label="Grade & section" icon={<GraduationCap size={18} />} placeholder="e.g. 10 - Archimedes" value={form.gradeSection ?? ""} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, gradeSection: formatGradeSection(v, f.gradeSection ?? "") })); }} maxLength={50} hint={GRADE_SECTION_HINT} />
          <Field label="Student Row No." rule="digits" maxLength={3} icon={<Hash size={18} />} inputMode="numeric" placeholder="e.g. 23" value={rowNo} onChange={e => setRowNo(e.target.value.replace(/\D/g, "").slice(0, 3))} hint="Your number in your teacher's class record." />
        </>
      ) : (
        <>
          <Field label="Department" rule="words" icon={<Building2 size={18} />} placeholder="e.g. Science Department" value={form.department ?? ""} onChange={set("department")} maxLength={100} />
          <Field label="Designation" rule="words" icon={<Award size={18} />} placeholder="e.g. Teacher III" value={form.position ?? ""} onChange={set("position")} maxLength={100} />
        </>
      )}
      <div>
        <label htmlFor="hobbies" className="block text-sm font-medium text-ink mb-1.5">Favourites & hobbies</label>
        <textarea id="hobbies" rows={3} maxLength={300} value={form.hobbies ?? ""} onChange={set("hobbies")} placeholder="e.g. Mystery novels, drawing, basketball" className="w-full border border-line-strong rounded-xl px-3 py-2.5 text-sm text-ink bg-surface resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
        <p className="text-xs text-ink-muted text-right">{(form.hobbies ?? "").length}/300</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEditing(false)} className={btnSecondary}><X size={16} aria-hidden="true" />Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Spinner size={16} /> : <Save size={16} aria-hidden="true" />}{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

function Hero({ label, value, Icon }: { label: string; value: string; Icon: typeof Clock }) {
  return (
    <div className="rounded-2xl bg-page border border-line p-2.5 min-w-0">
      <p className="text-[11px] font-medium text-ink-muted flex items-center gap-1"><Icon size={12} aria-hidden="true" />{label}</p>
      <p className="text-base font-bold text-ink truncate">{value}</p>
    </div>
  );
}

interface TimeSpent {
  app: { days: { day: string; seconds: number }[]; totalSeconds: number };
  library: { visits: number; seconds: number; weekSeconds: number; averageSeconds: number | null; insideNow: boolean; recent: { day: string; timeIn: string; timeOut: string | null }[] };
  loans: { returned: number; averageDays: number | null; borrowedNow: { title: string; days: number }[] };
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const weekday = (day: string) => new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short" });

/** Time Spent (app, library visits, borrowed books) and borrowing statistics. */
function StatsPanel({ txs, loading, userId, now }: { txs: Tx[]; loading: boolean; userId?: string; now: number }) {
  const { token } = useAuth();
  const [time, setTime] = useState<TimeSpent | null>(null);
  useEffect(() => {
    let live = true;
    void mobileApi("/api/v1/time/me", { token }).then(r => { if (live && r.ok) setTime(r.data as TimeSpent); });
    return () => { live = false; };
  }, [token]);
  // From the server (all devices); this phone's own record while offline.
  const local = lastDays(userId ? readUsage(userId) : {}, 7, now);
  const week = time ? time.app.days.map(d => ({ label: weekday(d.day), seconds: d.seconds })) : local;
  const today = week[week.length - 1]!;
  const weekTotal = week.reduce((a, d) => a + d.seconds, 0);
  const months = monthlyBorrows(txs, now);
  const ret = returnBreakdown(txs);
  const kept = daysKept(txs);
  const rows = [
    { label: "On time", n: ret.onTime, Icon: CheckCircle2, cls: "text-success bg-success-soft", bar: "bg-success" },
    { label: "Late", n: ret.late, Icon: Clock, cls: "text-warning bg-warning-soft", bar: "bg-warning" },
    { label: "Torn", n: ret.torn, Icon: BookX, cls: "text-danger bg-danger-soft", bar: "bg-danger" },
    { label: "Missing", n: ret.missing, Icon: SearchX, cls: "text-danger bg-danger-soft", bar: "bg-danger" },
  ];
  const card = "bg-surface rounded-3xl shadow-sm border border-line p-4 space-y-3";

  return (
    <div className="space-y-4">
      <section aria-labelledby="st-screen" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="st-screen" className="font-semibold text-primary-strong flex items-center gap-2"><Smartphone size={18} aria-hidden="true" />Time in the app</h2>
          <span className="text-[11px] text-ink-muted">Last 7 days · {time ? "all your devices" : "this phone (offline)"}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Hero label="Today" value={fmtDuration(today.seconds)} Icon={Clock} />
          <Hero label="This week" value={fmtDuration(weekTotal)} Icon={CalendarDays} />
          <Hero label="All time" value={time ? fmtDuration(time.app.totalSeconds) : "–"} Icon={Smartphone} />
        </div>
        <SplineArea title="Minutes in AklatOne per day" height={170} points={week.map(d => ({ label: d.label, value: Math.round(d.seconds / 60), display: fmtDuration(d.seconds) }))} />
      </section>

      <section aria-labelledby="st-library" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="st-library" className="font-semibold text-primary-strong flex items-center gap-2"><Library size={18} aria-hidden="true" />Time in the library</h2>
          {time?.library.insideNow && <span className="text-[11px] font-bold px-3 py-1 leading-tight rounded-full bg-success-soft text-success">Inside now</span>}
        </div>
        {!time ? <p className="text-sm text-ink-muted">Needs a connection to the library server.</p> : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Hero label="Visits" value={String(time.library.visits)} Icon={LogIn} />
              <Hero label="This week" value={fmtDuration(time.library.weekSeconds)} Icon={CalendarDays} />
              <Hero label="Per visit" value={time.library.averageSeconds === null ? "—" : fmtDuration(time.library.averageSeconds)} Icon={Clock} />
            </div>
            {time.library.recent.length === 0 ? <p className="text-sm text-ink-muted">No visits yet. Scan your Library ID card or the QR code at the library's Visitor's Log.</p> : (
              <ul className="space-y-1.5">
                {time.library.recent.slice(0, 5).map(v => (
                  <li key={v.timeIn} className="flex items-center justify-between text-sm rounded-xl bg-page px-3 py-2">
                    <span className="font-medium text-ink">{new Date(`${v.day}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}</span>
                    <span className="text-ink-muted">{clock(v.timeIn)} – {v.timeOut ? clock(v.timeOut) : "no Time Out"}</span>
                    <span className="font-semibold text-ink">{v.timeOut ? fmtDuration((new Date(v.timeOut).getTime() - new Date(v.timeIn).getTime()) / 1000) : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-ink-muted">From the Time In and Time Out at the library's Visitor's Log. Visits without a Time Out are not counted.</p>
          </>
        )}
      </section>

      <section aria-labelledby="st-borrow" className={card}>
        <h2 id="st-borrow" className="font-semibold text-primary-strong flex items-center gap-2"><BarChart3 size={18} aria-hidden="true" />Books borrowed per month</h2>
        <div className="grid grid-cols-2 gap-2">
          <Hero label="All time" value={loading ? "–" : `${txs.length} book${txs.length === 1 ? "" : "s"}`} Icon={BookOpenCheck} />
          <Hero label="Average days kept" value={kept === null ? "—" : `${kept} day${kept === 1 ? "" : "s"}`} Icon={CalendarDays} />
        </div>
        {time && time.loans.borrowedNow.length > 0 && (
          <ul className="space-y-1.5">
            {time.loans.borrowedNow.map(b => <li key={b.title} className="flex justify-between gap-2 text-sm rounded-xl bg-page px-3 py-2"><span className="truncate text-ink">{b.title}</span><span className="font-semibold text-ink shrink-0">{b.days === 0 ? "since today" : `${b.days} day${b.days === 1 ? "" : "s"} so far`}</span></li>)}
          </ul>
        )}
        <SplineArea title="Books borrowed per month" height={170} points={months} />
      </section>

      <section aria-labelledby="st-return" className={card}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="st-return" className="font-semibold text-primary-strong flex items-center gap-2"><BookCheck size={18} aria-hidden="true" />Return record</h2>
          {ret.total > 0 && <span className="text-xs font-semibold text-ink">{Math.round((ret.onTime / ret.total) * 100)}% on time</span>}
        </div>
        {ret.total === 0 ? <p className="text-sm text-ink-muted">No returned books yet.</p> : (
          <ul className="space-y-2.5">
            {rows.map(r => (
              <li key={r.label} className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.cls}`} aria-hidden="true"><r.Icon size={16} /></span>
                <span className="w-16 text-sm font-medium text-ink">{r.label}</span>
                <span className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <span className={`block h-full rounded-full ${r.bar} motion-safe:transition-[width] motion-safe:duration-700`} style={{ width: `${(r.n / ret.total) * 100}%` }} />
                </span>
                <span className="w-6 text-right text-sm font-bold text-ink">{r.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Books borrowed in this PH month (cancelled requests never left the shelf). */
export function borrowedThisMonth(txs: Tx[], today = phISODate()) {
  return txs.filter(t => t.status !== "CANCELLED" && t.borrowedAt && phISODate(t.borrowedAt).slice(0, 7) === today.slice(0, 7)).length;
}

/** Monthly reading goal the member sets for themself, with this month's progress. */
function ReadingGoal({ goal, txs, onSave }: { goal: number | null; txs: Tx[]; onSave: (p: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }> }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goal ?? 3);
  const done = borrowedThisMonth(txs);
  const save = async (g: number | null) => {
    const r = await onSave({ readingGoal: g });
    if (r.ok) { setEditing(false); toast({ tone: "success", title: g ? "Goal saved" : "Goal removed", message: g ? `${g} books this month. You can do it!` : "" }); }
    else toast({ tone: "error", title: "Not saved", message: r.message ?? "Please try again." });
  };
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  return (
    <section aria-labelledby="goal-title" className="bg-surface border border-line rounded-3xl p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-accent-soft text-on-accent flex items-center justify-center shrink-0" aria-hidden="true"><Target size={20} /></span>
        <div className="flex-1 min-w-0">
          <h2 id="goal-title" className="font-semibold text-primary-strong">Reading goal</h2>
          <p className="text-sm text-ink-muted">{goal ? (done >= goal ? `Goal reached: ${done} books this month!` : `${done} of ${goal} books this month`) : "Set how many books you want to borrow this month."}</p>
        </div>
        {!editing && <button type="button" onClick={() => { setValue(goal ?? 3); setEditing(true); }} className={`min-h-10 px-3 rounded-xl bg-primary-soft text-primary text-sm font-semibold ${focusRing}`}>{goal ? "Change" : "Set goal"}</button>}
      </div>
      {goal && !editing ? (
        <div className="mt-3 h-3 rounded-full bg-line overflow-hidden" role="progressbar" aria-label="Reading goal progress" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(done, goal)}>
          <div className={`h-full rounded-full motion-safe:transition-all ${done >= goal ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {editing && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button type="button" aria-label="Fewer books" onClick={() => setValue(v => Math.max(1, v - 1))} className={`w-11 h-11 rounded-xl bg-page border border-line text-lg font-bold ${focusRing}`}>−</button>
          <span className="w-14 text-center text-xl font-extrabold text-ink" aria-live="polite">{value}</span>
          <button type="button" aria-label="More books" onClick={() => setValue(v => Math.min(30, v + 1))} className={`w-11 h-11 rounded-xl bg-page border border-line text-lg font-bold ${focusRing}`}>+</button>
          <span className="text-sm text-ink-muted">books a month</span>
          <div className="flex gap-2 w-full mt-1">
            <button type="button" onClick={() => save(value)} className={`flex-1 min-h-11 rounded-xl bg-primary text-on-primary font-semibold ${focusRing}`}>Save</button>
            {goal && <button type="button" onClick={() => save(null)} className={`min-h-11 px-4 rounded-xl border border-line text-ink-muted font-semibold ${focusRing}`}>Remove</button>}
            <button type="button" onClick={() => setEditing(false)} className={`min-h-11 px-4 rounded-xl text-ink-muted font-semibold ${focusRing}`}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
