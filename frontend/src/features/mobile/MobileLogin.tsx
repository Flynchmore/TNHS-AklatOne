import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, User, Lock, KeyRound, GraduationCap, ScanLine } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { Alert, Field, FieldIconButton, Spinner, btnPrimary, focusRing, linkText, serverReachable, friendlyError } from "../../components/mobile/ui";
import { MobileAuthShell } from "../../components/mobile/MobileAuthShell";
import { AddEmailForm } from "../../components/mobile/AddEmailForm";

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
  const [emailToken, setEmailToken] = useState("");
  // Who is signing in: members and librarians each have their own screens after sign-in.
  const [as, setAs] = useState<"Member" | "Librarian">("Member");
  const attempted = useRef(false);

  useEffect(() => {
    if (!auth.ready || !auth.user) return;
    const staff = auth.user.role === "LIBRARIAN" || auth.user.role === "ADMIN";
    // Signed in here with the wrong choice: sign out again and say which one to pick.
    if (attempted.current && staff !== (as === "Librarian")) {
      attempted.current = false;
      auth.logout();
      setCode(null);
      setError(staff ? "This is a librarian account. Choose Librarian, then sign in." : "This is a member account. Choose Member, then sign in.");
      return;
    }
    nav(staff ? "/m/staff" : from, { replace: true });
  }, [auth, auth.ready, auth.user, nav, from, as]);

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
    attempted.current = true;
    const result = await auth.login(username, password);
    setLoading(false);
    if (result === true) return; // the effect above opens the right screen
    if (result && typeof result === "object") {
      if ("emailToken" in result) setEmailToken(result.emailToken);
      else setCode({ kind: result.requiresActivation ? "activate" : "otp", email: result.email });
      return;
    }
    setError(await failureMessage("Invalid username or password."));
  };

  if (emailToken) {
    return (
      <MobileAuthShell title="Add your email" subtitle="One more step before you sign in">
        <AddEmailForm emailToken={emailToken} onDone={() => setEmailToken("")} onBack={() => { setEmailToken(""); setError(""); }} />
      </MobileAuthShell>
    );
  }

  if (code) {
    return (
      <CodeStep kind={code.kind} email={code.email} username={username} password={password} onBack={() => { setCode(null); setError(""); }}
        onDone={() => { sessionStorage.removeItem("aklatone_welcome_shown"); sessionStorage.removeItem("aklatone_welcome_via"); }} />
    );
  }

  return (
    <MobileAuthShell title={as === "Librarian" ? "Librarian sign in" : "Welcome back"} subtitle={as === "Librarian" ? "Lend, return and add books with this phone" : "Sign in to your AklatOne account"}
      footer={as === "Member" ? <>New here? <Link to="/m/register" className={`font-bold text-accent underline underline-offset-2 rounded ${focusRing}`}>Create an account</Link></> : undefined}>
      <div role="radiogroup" aria-label="I am signing in as" className="grid grid-cols-2 gap-1 p-1 rounded-2xl border border-line-strong bg-page">
        {(["Member", "Librarian"] as const).map(r => {
          const Icon = r === "Member" ? GraduationCap : ScanLine;
          const on = as === r;
          return (
            <button key={r} type="button" role="radio" aria-checked={on} onClick={() => { setAs(r); setError(""); }}
              className={`min-h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold active:scale-95 ${focusRing} ${on ? "bg-gradient-to-br from-primary to-primary-strong text-on-primary shadow-md" : "text-ink"}`}>
              <Icon size={18} aria-hidden="true" />{r}
            </button>
          );
        })}
      </div>
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Username" maxLength={191} icon={<User size={18} />} autoComplete="username" autoCapitalize="none" placeholder="Enter username" value={username} onChange={e => setUsername(e.target.value)} />
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
