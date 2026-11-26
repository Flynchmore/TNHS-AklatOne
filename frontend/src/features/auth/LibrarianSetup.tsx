import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User, Briefcase, Building2, ShieldCheck, UserCog, KeyRound, Users } from "lucide-react";
import { StaffAuthShell } from "./StaffAuthShell";
import { apiFetch } from "../../lib/api";
import { Alert, Field, FieldIconButton, Spinner, StrengthMeter, btnPrimary, linkText, passwordStrength } from "../../components/mobile/ui";
import { RecoveryKeyCard } from "../../components/RecoveryKey";

/**
 * First-run screen (Staff Web/Desktop): creates the single shared librarian account while none exists.
 * With `recover` (/recover, emergency only): the school's recovery key replaces the librarian account.
 */
export function LibrarianSetup({ recover = false }: { recover?: boolean }) {
  const nav = useNavigate();
  const [checking, setChecking] = useState(!recover);
  const [form, setForm] = useState({ recoveryKey: "", name: "", position: "", department: "", email: "", password: "", confirm: "" });
  const [newKey, setNewKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // If a librarian already exists, this screen must not be used.
  useEffect(() => {
    if (recover) return;
    apiFetch("/api/v1/setup/status").then(r => {
      if (r.ok && !(r.data as { needsLibrarianSetup: boolean }).needsLibrarianSetup) nav("/login", { replace: true });
      else setChecking(false);
    });
  }, [nav, recover]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const required = (v: string) => (submitted && !v.trim() ? "This field is required." : undefined);
  const mismatch = form.confirm && form.password !== form.confirm ? "Passwords do not match." : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const { recoveryKey, name, position, department, email, password, confirm } = form;
    if (![name, position, department, email, password, ...(recover ? [recoveryKey] : [])].every(v => v.trim())) { setError("Please fill in all fields."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (passwordStrength(password).score < 3) { setError("Please use a stronger password (12+ characters, mixed case, numbers, symbols)."); return; }
    setError("");
    setLoading(true);
    const r = await apiFetch(recover ? "/api/v1/setup/recover" : "/api/v1/setup/librarian", { method: "POST", body: JSON.stringify({ name, position, department, email, password, ...(recover ? { recoveryKey } : {}) }) });
    setLoading(false);
    if (r.ok) { const d = r.data as { username: string; recoveryKey?: string }; setNewKey(d.recoveryKey ?? ""); setDone(d.username); }
    else setError(r.status === 0 ? "Can't reach the AklatOne server. Check your connection and try again." : r.message ?? "Setup failed.");
  };

  const shell = (children: React.ReactNode) => (
    <StaffAuthShell
      tagline="Welcome! Let's set up your library."
      highlights={[
        { icon: UserCog, text: "Creates the one shared librarian account" },
        { icon: Users, text: "Members use the AklatOne mobile app" },
        { icon: KeyRound, text: "Sign-in is protected by an emailed code" },
      ]}
    >
      <div className="space-y-6">{children}</div>
    </StaffAuthShell>
  );

  if (checking) return shell(<p role="status" className="flex items-center justify-center gap-2 text-ink-muted"><Spinner size={16} />Checking setup…</p>);

  if (done) return shell(
    <div role="status" className="text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto" aria-hidden="true"><ShieldCheck size={32} /></div>
      <h1 className="text-2xl font-bold text-primary-strong">Librarian account created</h1>
      <p className="text-sm text-ink-muted">Sign in with <strong className="text-ink">{done}</strong> and your new password. A 6-digit code will be sent to this email when you sign in.{recover && " The old librarian account was turned off and signed out."}</p>
      {newKey && <RecoveryKeyCard recoveryKey={newKey} onSaved={setKeySaved} />}
      <button type="button" disabled={!!newKey && !keySaved} onClick={() => nav("/login", { replace: true, state: { username: done } })} className={btnPrimary}>Go to Sign In</button>
    </div>,
  );

  const eye = (shown: boolean, toggle: () => void) => (
    <FieldIconButton label={shown ? "Hide password" : "Show password"} onClick={toggle}>{shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</FieldIconButton>
  );

  return shell(
    <>
      <div className="space-y-1">
        <p className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 ${recover ? "text-danger bg-danger-soft" : "text-primary bg-primary-soft"}`}>{recover ? "Emergency" : "First-time setup"}</p>
        <h1 className="text-2xl font-bold text-primary-strong">{recover ? "Replace the librarian account" : "Set up the librarian account"}</h1>
        <p className="text-sm text-ink-muted">{recover
          ? "Use this only when nobody can sign in to the librarian account (password and email both lost). The school's recovery key creates a new librarian account; the old one is turned off and signed out. Forgot only the password? Ask the ICT coordinator first."
          : "This creates the one shared librarian account for AklatOne Web and Desktop. It can only be done once."}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate className="space-y-4">
        {recover && <Field label="Recovery key" rule="code" maxLength={34} icon={<KeyRound size={18} />} autoComplete="off" autoCapitalize="characters" placeholder="AKLT-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" value={form.recoveryKey} onChange={set("recoveryKey")} error={required(form.recoveryKey)} hint="From the paper the school printed when AklatOne was set up." />}
        <Field label="Name" rule="name" maxLength={100} icon={<User size={18} />} autoComplete="name" placeholder="Full name" value={form.name} onChange={set("name")} error={required(form.name)} required />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Position" rule="words" maxLength={100} icon={<Briefcase size={18} />} autoComplete="organization-title" placeholder="e.g. Librarian" value={form.position} onChange={set("position")} error={required(form.position)} required />
          <Field label="Department" rule="words" maxLength={100} icon={<Building2 size={18} />} placeholder="e.g. Library" value={form.department} onChange={set("department")} error={required(form.department)} required />
        </div>
        <Field label="Email" type="email" rule="email" icon={<Mail size={18} />} autoComplete="email" placeholder="librarian@example.com" value={form.email} onChange={set("email")} error={required(form.email)} hint="You will sign in with this email." required />
        <div>
          <Field label="Password" type={show ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Create a password" value={form.password} onChange={set("password")} error={required(form.password)} trailing={eye(show, () => setShow(!show))} required />
          <StrengthMeter password={form.password} />
        </div>
        <Field label="Confirm password" type={showConfirm ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Re-enter password" value={form.confirm} onChange={set("confirm")} error={mismatch} trailing={eye(showConfirm, () => setShowConfirm(!showConfirm))} required />
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Creating account…" : recover ? "Replace the librarian account" : "Create librarian account"}
        </button>
      </form>
      <p className="text-center text-sm text-ink-muted">{recover ? "Remembered the password?" : "Already set up?"} <Link to="/login" className={linkText}>Sign in</Link></p>
    </>,
  );
}
