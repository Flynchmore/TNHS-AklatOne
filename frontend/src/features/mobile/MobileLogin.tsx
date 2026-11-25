import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, User, Lock, KeyRound } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { Alert, Field, FieldIconButton, Spinner, btnPrimary, focusRing, linkText, serverReachable, friendlyError } from "../../components/mobile/ui";
import { MobileAuthShell } from "../../components/mobile/MobileAuthShell";

type CodeKind = "otp" | "activate";
const CODE_TEXT: Record<CodeKind, { title: string; subtitle: (email: string) => string; button: string }> = {
  otp: { title: "Two-step sign-in", subtitle: email => `Enter the 6-digit code sent to ${email}`, button: "Verify & Sign In" },
  activate: { title: "Activate your account", subtitle: email => `Enter the 6-digit activation code sent to ${email}`, button: "Activate & Sign In" },
};

/**
 * Entering an emailed 6-digit code: the 2-step sign-in code or the activation code of a new account. A new code comes
 * from signing in again, which the server answers with a fresh code of the same kind.
 */
export function CodeStep({ kind, email, username, password, onBack, onDone }: { kind: CodeKind; email: string; username: string; password: string; onBack: () => void; onDone: () => void }) {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(60);
  const text = CODE_TEXT[kind];

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const failure = async (rejected: string) => {
    const err = auth.lastAuthError?.();
    if (!err) return (await serverReachable()) ? rejected : friendlyError(0);
    return err.status === 401 || err.status === 400 ? (err.message && err.status === 400 ? err.message : rejected) : friendlyError(err.status, err.message);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) { setError("Please enter the 6-digit code."); return; }
    setLoading(true);
    setError("");
    const ok = kind === "otp" ? await auth.verifyLoginOtp(username, code) : await auth.activate(username, code);
    if (ok) { onDone(); return; }
    setLoading(false);
    setError(await failure("Invalid or expired code."));
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    setError("");
    const result = await auth.login(username, password);
    setLoading(false);
    if (result && typeof result === "object") setCooldown(60);
    else setError(await failure("Could not send a new code. Please sign in again."));
  };

  return (
    <MobileAuthShell title={text.title} subtitle={text.subtitle(email)}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={verify} className="space-y-4" noValidate>
        <Field
          label="6-digit code"
          icon={<KeyRound size={18} />}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="tracking-widest text-center font-bold"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
        />
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Checking…" : text.button}
        </button>
      </form>
      <button type="button" onClick={resend} disabled={loading || cooldown > 0} className={`w-full min-h-11 text-sm text-primary font-medium disabled:opacity-60 rounded-lg ${focusRing}`}>
        {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
      </button>
      <button type="button" onClick={onBack} className={`w-full min-h-11 text-sm text-ink-muted hover:text-primary rounded-lg ${focusRing}`}>
        Back
      </button>
    </MobileAuthShell>
  );
}

export function MobileLogin() {
  const nav = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const state = location.state as { from?: string } | null;
  const from = state?.from?.startsWith("/m") ? state.from : "/m";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<{ kind: CodeKind; email: string } | null>(null);

  useEffect(() => {
    if (auth.ready && auth.user) nav(from, { replace: true });
  }, [auth.ready, auth.user, nav, from]);

  // auth.login returns false for every failure; use the recorded status to show the real reason.
  const failureMessage = async (rejected: string) => {
    const err = auth.lastAuthError?.();
    if (!err) return (await serverReachable()) ? rejected : friendlyError(0);
    return err.status === 401 || err.status === 400 ? rejected : friendlyError(err.status, err.message);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError("Please enter your username and password."); return; }
    setLoading(true);
    setError("");
    const result = await auth.login(username, password);
    setLoading(false);
    if (result === true) { nav(from, { replace: true }); return; }
    if (result && typeof result === "object") { setCode({ kind: result.requiresActivation ? "activate" : "otp", email: result.email }); return; }
    setError(await failureMessage("Invalid username or password."));
  };

  if (code) {
    return (
      <CodeStep kind={code.kind} email={code.email} username={username} password={password} onBack={() => { setCode(null); setError(""); }}
        onDone={() => { sessionStorage.removeItem("aklatone_welcome_shown"); sessionStorage.removeItem("aklatone_welcome_via"); nav(from, { replace: true }); }} />
    );
  }

  return (
    <MobileAuthShell title="Welcome back" subtitle="Sign in to your AklatOne account"
      footer={<>New here? <Link to="/m/register" className={`font-bold text-accent underline underline-offset-2 rounded ${focusRing}`}>Create an account</Link></>}>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Username" icon={<User size={18} />} autoComplete="username" autoCapitalize="none" placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} />
        <Field
          label="Password"
          icon={<Lock size={18} />}
          type={show ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Enter password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          trailing={<FieldIconButton label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</FieldIconButton>}
        />
        <div className="flex justify-end text-sm">
          <Link to="/m/forgot-password" className={`${linkText} py-1`}>Forgot password?</Link>
        </div>
        <button type="submit" className={btnPrimary} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </MobileAuthShell>
  );
}
