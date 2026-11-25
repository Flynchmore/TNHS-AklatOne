import { useEffect, useState } from "react";
import { Settings as SettingsIcon, UserCog, Palette, KeyRound, Info, Sun, Moon, Eye, EyeOff, Check, MonitorSmartphone } from "lucide-react";
import { SignInSessions } from "../../components/SignInSessions";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../auth/auth";
import { useToast } from "../../components/Toast";
import { PageHeader, Panel, btn, input, label } from "../../components/staff/ui";
import { StrengthMeter, focusRing, passwordStrength } from "../../components/mobile/ui";
import { setTheme, useTheme, type Theme } from "../../components/mobile/theme";
import { BackupPanel } from "./BackupPanel";
import { RecoveryKeyCard } from "../../components/RecoveryKey";
import { phDateTime } from "../../lib/dates";
import { SystemPanel } from "./SystemPanel";

/** Staff "Settings": librarian profile, theme, password and About. */
export function Settings() {
  const { hasPerm, user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Your profile, the look of AklatOne, your password, database backups and app information." />
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <ProfilePanel />
        <PasswordPanel />
        <Panel title="Sign-in devices" icon={MonitorSmartphone} delay={0.12}><SignInSessions /></Panel>
        {(user?.role === "LIBRARIAN" || user?.role === "ADMIN") && <RecoveryKeyPanel />}
        <ThemePanel />
        <AboutPanel />
        {hasPerm("backup:manage") && <SystemPanel />}
        {hasPerm("backup:manage") && <BackupPanel />}
      </div>
    </div>
  );
}

function ProfilePanel() {
  const { user, token, updateUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ displayName: user?.displayName ?? "", position: user?.position ?? "", department: user?.department ?? "" });
  const [saving, setSaving] = useState(false);
  const changed = form.displayName !== (user?.displayName ?? "") || form.position !== (user?.position ?? "") || form.department !== (user?.department ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.displayName.trim()) { toast({ tone: "error", title: "Name is required", message: "Enter your full name." }); return; }
    setSaving(true);
    const body = { displayName: form.displayName.trim(), position: form.position.trim(), department: form.department.trim() };
    const r = await apiFetch("/api/v1/auth/profile", { method: "PATCH", body: JSON.stringify(body), token });
    setSaving(false);
    if (!r.ok) { toast({ tone: "error", title: "Profile not saved", message: r.message ?? "Please try again." }); return; }
    updateUser(body);
    toast({ tone: "success", title: "Profile saved", message: "Your name and designation were updated." });
  };

  const field = (text: string, k: keyof typeof form, max: number) => (
    <div>
      <label htmlFor={`profile-${k}`} className={label}>{text}</label>
      <input id={`profile-${k}`} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} maxLength={max} className={input} />
    </div>
  );

  return (
    <Panel title="Librarian profile" icon={UserCog} delay={0.05}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-primary-soft to-transparent">
          <span className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-strong text-on-primary text-xl font-bold flex items-center justify-center" aria-hidden="true">{(user?.displayName || user?.username || "L").charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="font-bold text-ink truncate">{user?.displayName || user?.username}</p>
            <p className="text-sm text-ink-muted truncate">{user?.email || user?.username} · {user?.role}</p>
          </div>
        </div>
        {field("Full name", "displayName", 100)}
        <div className="grid sm:grid-cols-2 gap-4">
          {field("Position", "position", 100)}
          {field("Department", "department", 100)}
        </div>
        <p className="text-xs text-ink-muted">Your sign-in email cannot be changed here.</p>
        <button type="submit" disabled={saving || !changed} className={btn.primary}>{saving ? "Saving…" : "Save profile"}</button>
      </form>
    </Panel>
  );
}

function PasswordPanel() {
  const { token, replaceToken } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  // Step 2 (accounts with an email): the emailed password change code.
  const [codeTo, setCodeTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const mismatch = confirm && pw !== confirm;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStrength(pw).score < 3) { toast({ tone: "error", title: "Password too weak", message: "Use 12+ characters with mixed case, numbers and symbols." }); return; }
    if (pw !== confirm) { toast({ tone: "error", title: "Passwords do not match", message: "Type the same new password twice." }); return; }
    setSaving(true);
    if (codeTo === null) {
      const c = await apiFetch("/api/v1/auth/password-code", { method: "POST", body: "{}", token });
      if (!c.ok) { setSaving(false); toast({ tone: "error", title: "Code not sent", message: c.message ?? "Please try again." }); return; }
      const sent = c.data as { needsCode: boolean; email?: string };
      if (sent.needsCode) { setSaving(false); setCodeTo(sent.email ?? "your email"); toast({ tone: "success", title: "Code sent", message: "Enter the 6-digit code from your email to confirm." }); return; }
    }
    const r = await apiFetch("/api/v1/auth/profile", { method: "PATCH", body: JSON.stringify({ password: pw, currentPassword: current, ...(codeTo !== null ? { code } : {}) }), token });
    setSaving(false);
    if (!r.ok) { toast({ tone: "error", title: "Password not changed", message: r.message ?? "Please try again." }); return; }
    const fresh = (r.data as { token?: string } | null)?.token;
    if (fresh) replaceToken(fresh);
    setCurrent(""); setPw(""); setConfirm(""); setCodeTo(null); setCode("");
    toast({ tone: "success", title: "Password changed", message: "Other devices were signed out. A security email was sent to you." });
  };

  const eye = <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Hide passwords" : "Show passwords"} className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-ink-muted hover:text-primary hover:bg-primary-soft ${focusRing}`}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>;

  return (
    <Panel title="Change password" icon={KeyRound} delay={0.1}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <div>
          <label htmlFor="current-password" className={label}>Current password</label>
          <input id="current-password" type={show ? "text" : "password"} value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" className={input} />
        </div>
        <div>
          <label htmlFor="new-password" className={label}>New password</label>
          <div className="relative"><input id="new-password" type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" className={`${input} pr-12`} />{eye}</div>
          <StrengthMeter password={pw} />
        </div>
        <div>
          <label htmlFor="confirm-password" className={label}>Confirm new password</label>
          <input id="confirm-password" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={!!mismatch} aria-describedby={mismatch ? "confirm-error" : undefined} className={input} />
          {mismatch && <p id="confirm-error" className="text-xs text-danger mt-1">Passwords do not match.</p>}
        </div>
        {codeTo !== null && (
          <div>
            <label htmlFor="password-code" className={label}>6-digit code from your email</label>
            <input id="password-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-describedby="password-code-hint" className={`${input} tracking-widest font-bold`} />
            <p id="password-code-hint" className="text-xs text-ink-muted mt-1">Sent to {codeTo}. It expires in 10 minutes.</p>
          </div>
        )}
        <button type="submit" disabled={saving || !current || !pw || !confirm || (codeTo !== null && code.length < 6)} className={btn.primary}>{saving ? "Please wait…" : codeTo !== null ? "Confirm new password" : "Change password"}</button>
      </form>
    </Panel>
  );
}

function ThemePanel() {
  const toast = useToast();
  const theme = useTheme();
  const options: { key: Theme; label: string; icon: typeof Sun; hint: string }[] = [
    { key: "light", label: "Light", icon: Sun, hint: "Bright, for daytime" },
    { key: "dark", label: "Dark", icon: Moon, hint: "Easier on the eyes at night" },
  ];
  const pick = (t: Theme) => {
    if (t === theme) return;
    setTheme(t);
    toast({ tone: "success", title: `${t === "dark" ? "Dark" : "Light"} theme on`, message: "Saved on this computer." });
  };
  return (
    <Panel title="Theme" icon={Palette} delay={0.15}>
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
        {options.map(o => {
          const on = theme === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => pick(o.key)}
              className={`group relative p-4 rounded-2xl border text-left motion-safe:transition-all motion-safe:duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${focusRing} ${on ? "border-primary ring-2 ring-primary/30 bg-primary-soft/50" : "border-line hover:border-primary/40"}`}>
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 motion-safe:transition-transform group-hover:rotate-12 ${o.key === "dark" ? "bg-[#172036] text-[#C9D6FF]" : "bg-accent-soft text-on-accent"}`} aria-hidden="true"><o.icon size={22} /></span>
              <span className="block font-semibold text-ink">{o.label}</span>
              <span className="block text-xs text-ink-muted">{o.hint}</span>
              {on && <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center ak-badge-pop" aria-hidden="true"><Check size={14} /></span>}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function AboutPanel() {
  return (
    <Panel title="About AklatOne" icon={Info} delay={0.2}>
      <div className="flex items-center gap-4 mb-4">
        <img src="/aklatone-icon.png" alt="" className="w-16 h-16 rounded-2xl shadow-md bg-white p-1" />
        <div>
          <p className="text-xl font-bold text-primary-strong">AklatOne</p>
          <p className="text-sm text-ink-muted">Library Management System</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {[["Version", __APP_VERSION__], ["Build date", __BUILD_DATE__], ["School", "Tagumpay National High School"], ["Apps", "Web, Desktop, Android and iOS"]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-page border border-line p-3"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs text-ink-muted mt-4">Staff portal for managing the school library catalog, borrowing and members. Members use the AklatOne mobile app.</p>
    </Panel>
  );
}

/** The library's emergency recovery key: when it was made, and making a new one (the old one stops working). */
function RecoveryKeyPanel() {
  const { token } = useAuth();
  const toast = useToast();
  const [createdAt, setCreatedAt] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  useEffect(() => {
    void apiFetch("/api/v1/setup/recovery-key", { token }).then(r => setCreatedAt(r.ok ? (r.data as { createdAt: string | null }).createdAt : null));
  }, [token]);
  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await apiFetch("/api/v1/setup/recovery-key", { method: "POST", token, body: JSON.stringify({ currentPassword: password }) });
    setBusy(false);
    if (!r.ok) { toast({ tone: "error", title: "No new key", message: r.message ?? "Please try again." }); return; }
    setKey((r.data as { recoveryKey: string }).recoveryKey);
    setCreatedAt(new Date().toISOString());
    setPassword("");
  };
  return (
    <Panel title="Emergency recovery key" icon={KeyRound} delay={0.14}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">If nobody can sign in to the librarian account (password and email both lost), this key creates a new librarian account from <b>Can't access the librarian account?</b> on the sign-in page. Keep it printed with the principal or the ICT coordinator.</p>
        <p className="text-sm text-ink">{createdAt === undefined ? "Checking…" : createdAt ? <>Current key made on <b>{phDateTime(createdAt)}</b>.</> : <b className="text-danger">No recovery key yet. Make one now.</b>}</p>
        {key ? <RecoveryKeyCard recoveryKey={key} onSaved={saved => { if (saved) toast({ tone: "success", title: "Keep it safe", message: "The old key no longer works." }); }} /> : (
          <form onSubmit={make} className="flex flex-wrap items-end gap-3" noValidate>
            <div className="flex-1 min-w-[14rem]">
              <label htmlFor="rk-password" className={label}>Your password</label>
              <input id="rk-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={input} />
            </div>
            <button type="submit" disabled={busy || !password} className={btn.secondary}>{busy ? "Making…" : createdAt ? "Make a new key" : "Make the recovery key"}</button>
          </form>
        )}
      </div>
    </Panel>
  );
}
