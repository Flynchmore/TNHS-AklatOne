import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User, Briefcase, Building2, ShieldCheck, UserCog, KeyRound, Users } from "lucide-react";
import { StaffAuthShell } from "./StaffAuthShell";
import { apiFetch } from "../../lib/api";
import { Alert, Field, FieldIconButton, Spinner, StrengthMeter, btnPrimary, linkText, passwordStrength } from "../../components/mobile/ui";

/** First-run screen (Staff Web/Desktop): creates the single shared librarian account while none exists. */
export function LibrarianSetup() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ name: "", position: "", department: "", email: "", password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // If a librarian already exists, this screen must not be used.
  useEffect(() => {
    apiFetch("/api/v1/setup/status").then(r => {
      if (r.ok && !(r.data as { needsLibrarianSetup: boolean }).needsLibrarianSetup) nav("/login", { replace: true });
      else setChecking(false);
    });
  }, [nav]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const required = (v: string) => (submitted && !v.trim() ? "This field is required." : undefined);
  const mismatch = form.confirm && form.password !== form.confirm ? "Passwords do not match." : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const { name, position, department, email, password, confirm } = form;
    if (![name, position, department, email, password].every(v => v.trim())) { setError("Please fill in all fields."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (passwordStrength(password).score < 3) { setError("Please use a stronger password (12+ characters, mixed case, numbers, symbols)."); return; }
    setError("");
    setLoading(true);
    const r = await apiFetch("/api/v1/setup/librarian", { method: "POST", body: JSON.stringify({ name, position, department, email, password }) });
    setLoading(false);
    if (r.ok) setDone((r.data as { username: string }).username);
    else setError(r.status === 0 ? "Can't reach the AklatOne server. Make sure the backend is running." : r.message ?? "Setup failed.");
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
      <p className="text-sm text-ink-muted">Sign in with <strong className="text-ink">{done}</strong> and your new password. A 6-digit code will be sent to this email when you sign in.</p>
      <button type="button" onClick={() => nav("/login", { replace: true, state: { username: done } })} className={btnPrimary}>Go to Sign In</button>
    </div>,
  );

  const eye = (shown: boolean, toggle: () => void) => (
    <FieldIconButton label={shown ? "Hide password" : "Show password"} onClick={toggle}>{shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</FieldIconButton>
  );

  return shell(
    <>
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-soft rounded-full px-3 py-1">First-time setup</p>
        <h1 className="text-2xl font-bold text-primary-strong">Set up the librarian account</h1>
        <p className="text-sm text-ink-muted">This creates the one shared librarian account for AklatOne Web and Desktop. It can only be done once.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" icon={<User size={18} />} autoComplete="name" placeholder="Full name" value={form.name} onChange={set("name")} error={required(form.name)} required />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Position" icon={<Briefcase size={18} />} autoComplete="organization-title" placeholder="e.g. Librarian" value={form.position} onChange={set("position")} error={required(form.position)} required />
          <Field label="Department" icon={<Building2 size={18} />} placeholder="e.g. Library" value={form.department} onChange={set("department")} error={required(form.department)} required />
        </div>
        <Field label="Email" type="email" icon={<Mail size={18} />} autoComplete="email" placeholder="librarian@example.com" value={form.email} onChange={set("email")} error={required(form.email)} hint="You will sign in with this email." required />
        <div>
          <Field label="Password" type={show ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Create a password" value={form.password} onChange={set("password")} error={required(form.password)} trailing={eye(show, () => setShow(!show))} required />
          <StrengthMeter password={form.password} />
        </div>
        <Field label="Confirm password" type={showConfirm ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Re-enter password" value={form.confirm} onChange={set("confirm")} error={mismatch} trailing={eye(showConfirm, () => setShowConfirm(!showConfirm))} required />
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Creating account…" : "Create librarian account"}
        </button>
      </form>
      <p className="text-center text-sm text-ink-muted">Already set up? <Link to="/login" className={linkText}>Sign in</Link></p>
    </>,
  );
}
