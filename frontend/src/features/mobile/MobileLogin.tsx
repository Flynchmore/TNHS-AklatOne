import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, User, Lock, KeyRound } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { Alert, Field, FieldIconButton, Spinner, btnPrimary, focusRing, linkText, serverReachable, friendlyError } from "../../components/mobile/ui";
import { MobileAuthShell } from "../../components/mobile/MobileAuthShell";

export function MobileLogin() {
  const nav = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const from = (location.state as { from?: string } | null)?.from?.startsWith("/m") ? (location.state as { from: string }).from : "/m";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"login" | "otp">("login");
  const [otp, setOtp] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (auth.ready && auth.user) nav(from, { replace: true });
  }, [auth.ready, auth.user, nav, from]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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
    if (result === true) { nav(from, { replace: true }); return; }
    if (result && typeof result === "object" && result.requiresOtp) {
      setLoading(false);
      setOtpEmail(result.email);
      setStep("otp");
      setResendCooldown(60);
      return;
    }
    setLoading(false);
    setError(await failureMessage("Invalid username or password."));
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Please enter the 6-digit code."); return; }
    setLoading(true);
    setError("");
    const ok = await auth.verifyLoginOtp(username, otp);
    if (ok) { sessionStorage.removeItem("aklatone_welcome_shown"); sessionStorage.removeItem("aklatone_welcome_via"); nav(from, { replace: true }); return; }
    setLoading(false);
    setError(await failureMessage("Invalid or expired code."));
  };

  // A new sign-in code comes from signing in again (same as the Staff Web).
  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");
    const result = await auth.login(username, password);
    setLoading(false);
    if (result && typeof result === "object" && result.requiresOtp) setResendCooldown(60);
    else setError(await failureMessage("Could not send a new code. Please sign in again."));
  };

  if (step === "otp") {
    return (
      <MobileAuthShell title="Two-step sign-in" subtitle={`Enter the 6-digit code sent to ${otpEmail}`}>
          {error && <Alert>{error}</Alert>}
          <form onSubmit={verifyOtp} className="space-y-4" noValidate>
            <Field
              label="6-digit code"
              icon={<KeyRound size={18} />}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="tracking-widest text-center font-bold"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className={btnPrimary} disabled={loading}>
              {loading && <Spinner />}
              {loading ? "Verifying…" : "Verify & Sign In"}
            </button>
          </form>
          <button type="button" onClick={resendOtp} disabled={loading || resendCooldown > 0} className={`w-full min-h-11 text-sm text-primary font-medium disabled:opacity-60 rounded-lg ${focusRing}`}>
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
          </button>
          <button type="button" onClick={() => { setStep("login"); setOtp(""); setError(""); }} className={`w-full min-h-11 text-sm text-ink-muted hover:text-primary rounded-lg ${focusRing}`}>
            Back to sign in
          </button>
      </MobileAuthShell>
    );
  }

  return (
    <MobileAuthShell title="Welcome back" subtitle="Sign in to your AklatOne account">
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
          <p className="text-center text-sm text-ink-muted pt-2">
            No account yet? Your account and Library ID are made by the school librarian.
          </p>
    </MobileAuthShell>
  );
}
