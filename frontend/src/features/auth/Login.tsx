import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User, ClipboardCheck, BookCopy, BellRing, MailCheck, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "./auth";
import { isDesktop } from "../../lib/offline";
import { apiFetch } from "../../lib/api";
import { Alert, Field, FieldIconButton, Spinner, btnPrimary, focusRing } from "../../components/mobile/ui";
import { StaffAuthShell, OtpBoxes } from "./StaffAuthShell";
import { AddEmailForm } from "../../components/mobile/AddEmailForm";
import { useToast } from "../../components/Toast";

const MIN_VERIFY_MS = 3000;
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

const loginHighlights = [
  { icon: ClipboardCheck, text: "Review and approve borrow requests" },
  { icon: BookCopy, text: "Track borrowed books, returns, and book condition" },
  { icon: BellRing, text: "Send overdue notices to members" },
];
const otpHighlights = [
  { icon: MailCheck, text: "A one-time code was sent to your email" },
  { icon: ShieldCheck, text: "Codes expire after 10 minutes" },
];

export function Login() {
  const { login, verifyLoginOtp, expired, lastAuthError } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const welcome = () => toast({ tone: "success", title: "Signed in successfully", message: "Welcome to the AklatOne staff portal." });
  const [username, setUsername] = useState((location.state as { username?: string } | null)?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [emailToken, setEmailToken] = useState("");

  // First run: no librarian account yet, so go to setup.
  useEffect(() => {
    apiFetch("/api/v1/setup/status").then(r => {
      if (r.ok && (r.data as { needsLibrarianSetup?: boolean } | null)?.needsLibrarianSetup) nav("/setup", { replace: true });
    });
  }, [nav]);

  const reason = (rejected: string) => {
    const err = lastAuthError?.();
    if (!err || err.status === 400) return rejected;
    if (err.status === 401) {
      if (err.remaining === undefined) return rejected;
      return err.remaining > 0
        ? `${rejected} ${err.remaining} attempt${err.remaining === 1 ? "" : "s"} left before a 15-minute lock.`
        : `${rejected} This account is now locked for 15 minutes.`;
    }
    if (err.status === 0) return "Can't reach the AklatOne server. Make sure the backend is running.";
    if (err.status === 429) return err.message ?? "Too many failed attempts. Please wait 15 minutes and try again.";
    return err.message ?? "Sign-in failed. Please try again.";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError("Please enter your username and password."); return; }
    setLoading(true);
    setError("");
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result === true) { welcome(); nav(isDesktop ? "/choose" : "/"); }
    else if (result && typeof result === "object" && "emailToken" in result) setEmailToken(result.emailToken);
    else if (result && typeof result === "object" && result.requiresOtp) { setOtpEmail(result.email); setOtp(""); setInfo(""); }
    else setError(reason("Invalid username or password."));
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Please enter all 6 digits of the code."); return; }
    setLoading(true);
    setError("");
    const started = Date.now();
    const ok = await verifyLoginOtp(username.trim(), otp);
    // Keep the spinner up for at least 3 seconds so the check feels deliberate.
    await pause(Math.max(0, MIN_VERIFY_MS - (Date.now() - started)));
    setLoading(false);
    if (ok) { welcome(); nav(isDesktop ? "/choose" : "/"); } else { setError(reason("Invalid or expired code.")); setOtp(""); }
  };

  const resend = async () => {
    setError("");
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result && typeof result === "object" && "requiresOtp" in result) setInfo("A new code was sent.");
    else setError(reason("Could not send a new code."));
  };

  if (emailToken) {
    return (
      <StaffAuthShell tagline="One more step to keep the library secure." highlights={otpHighlights}>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-primary-strong">Add your email</h1>
          <AddEmailForm emailToken={emailToken} onDone={() => { welcome(); nav(isDesktop ? "/choose" : "/"); }} onBack={() => setEmailToken("")} />
        </div>
      </StaffAuthShell>
    );
  }

  if (otpEmail) {
    return (
      <StaffAuthShell tagline="One more step to keep the library secure." highlights={otpHighlights}>
        <div key="otp" className="space-y-6 ak-from-right">
          <div className="space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center" aria-hidden="true"><MailCheck size={28} /></div>
            <h1 className="text-2xl font-bold text-primary-strong">Enter your code</h1>
            <p className="text-sm text-ink-muted">We sent a 6-digit code to <strong className="text-ink">{otpEmail}</strong>.</p>
          </div>
          {error && <Alert>{error}</Alert>}
          {info && <Alert tone="success">{info}</Alert>}
          <form onSubmit={verify} className="space-y-5" noValidate>
            <OtpBoxes value={otp} onChange={setOtp} />
            <p className="text-xs text-ink-muted">No email? During development the code is also printed in the backend terminal as [DEV OTP].</p>
            <button type="submit" className={btnPrimary} disabled={loading}>{loading && <Spinner />}{loading ? "Verifying…" : "Verify Code"}</button>
          </form>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setOtpEmail(null); setOtp(""); setError(""); setInfo(""); }} className={`inline-flex items-center gap-1 text-ink-muted hover:text-primary min-h-10 px-2 -ml-2 rounded-lg ${focusRing}`}><ArrowLeft size={16} aria-hidden="true" />Back to sign in</button>
            <button type="button" onClick={resend} disabled={loading} className={`text-primary font-medium min-h-10 px-2 -mr-2 rounded-lg disabled:opacity-60 ${focusRing}`}>Resend code</button>
          </div>
        </div>
      </StaffAuthShell>
    );
  }

  return (
    <StaffAuthShell tagline="Manage the school library from one place." highlights={loginHighlights}>
      <div key="login" className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-strong">Welcome back</h1>
          <p className="text-sm text-ink-muted mt-1">Sign in to the AklatOne staff portal.</p>
        </div>
        {expired && <Alert tone="warning">Your session has expired. Please sign in again.</Alert>}
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Username" icon={<User size={18} />} autoComplete="username" autoCapitalize="none" placeholder="Username or email" value={username} onChange={e => setUsername(e.target.value)} hint="Librarian: use the email from first-time setup." />
          <Field
            label="Password"
            type={showPassword ? "text" : "password"}
            icon={<Lock size={18} />}
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            trailing={<FieldIconButton label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</FieldIconButton>}
          />
          <div className="flex justify-end -mt-1"><Link to="/forgot-password" className={`text-sm font-medium text-primary hover:underline rounded py-1 ${focusRing}`}>Forgot password?</Link></div>
          <button type="submit" className={btnPrimary} disabled={loading}>{loading && <Spinner />}{loading ? "Signing in…" : "Sign in"}</button>
        </form>
        {/* Emergency only: kept small on purpose. */}
        <p className="text-center text-xs text-ink-muted">
          <Link to="/recover" className={`underline underline-offset-2 hover:text-primary rounded ${focusRing}`}>Can't access the librarian account?</Link>
        </p>
      </div>
    </StaffAuthShell>
  );
}
