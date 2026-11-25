import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, KeyRound } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { useToast } from "../../components/Toast";
import { Alert, Field, FieldIconButton, Spinner, StrengthMeter, btnPrimary, focusRing, linkText, mobileApi, passwordStrength } from "../../components/mobile/ui";
import { MobileAuthShell } from "../../components/mobile/MobileAuthShell";

type Step = "email" | "otp" | "reset" | "done";

const titles: Record<Exclude<Step, "done">, [string, string]> = {
  email: ["Forgot Password", "Reset your password"],
  otp: ["Verify Code", "Enter the code we sent you"],
  reset: ["New Password", "Create a new password"],
};

export function MobileForgotPassword() {
  const nav = useNavigate();
  const auth = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const target = () => ({ email });

  const requestOtp = async () => {
    setError("");
    setLoading(true);
    const r = await mobileApi("/api/v1/auth/forgot-password", { method: "POST", body: JSON.stringify(target()) });
    setLoading(false);
    if (!r.ok) { setError(r.message ?? "Failed to send the code."); return false; }
    setInfo((r.data as { message?: string } | null)?.message ?? "Code sent. Check your email.");
    toast({ tone: "success", title: "Code sent", message: "Check your email for the 6-digit code." });
    setResendCooldown(60);
    return true;
  };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Please enter your registered email."); return; }
    if (await requestOtp()) setStep("otp");
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Please enter the 6-digit code."); return; }
    setError("");
    setLoading(true);
    const r = await mobileApi("/api/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ ...target(), otp }) });
    setLoading(false);
    if (r.ok) { setInfo(""); setStep("reset"); }
    else setError(r.message ?? "Invalid or expired code.");
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirm) { setError("Please fill in both fields."); return; }
    if (newPassword !== confirm) { setError("Passwords do not match."); return; }
    if (passwordStrength(newPassword).score < 3) { setError("Please use a stronger password."); return; }
    setError("");
    setLoading(true);
    const r = await mobileApi("/api/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ ...target(), otp, newPassword }) });
    setLoading(false);
    if (r.ok) {
      if ((r.data as { token?: string } | null)?.token) auth.login(email, newPassword).catch(() => {});
      setStep("done");
    } else {
      setError(r.message ?? "Failed to reset password.");
    }
  };

  if (step === "done") {
    return (
      <MobileAuthShell title="Password changed" subtitle="Your password has been updated. You can now sign in with your new password.">
        <div role="status" className="w-20 h-20 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <button onClick={() => nav("/m/login")} className={btnPrimary}>Go to Sign In</button>
      </MobileAuthShell>
    );
  }

  const [title, subtitle] = titles[step];
  const eye = (shown: boolean, toggle: () => void) => (
    <FieldIconButton label={shown ? "Hide password" : "Show password"} onClick={toggle}>
      {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </FieldIconButton>
  );

  return (
    <MobileAuthShell title={title} subtitle={subtitle}>
          {error && <Alert>{error}</Alert>}
          {info && <Alert tone="info">{info}</Alert>}

          {step === "email" && (
            <form onSubmit={sendOtp} className="space-y-4" noValidate>
              <Field label="Registered email" type="email" icon={<Mail size={18} />} autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} hint="We'll send a 6-digit code to this email." />
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading && <Spinner />}
                {loading ? "Sending…" : "Send code"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp} className="space-y-4" noValidate>
              <Field label="6-digit code" icon={<KeyRound size={18} />} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="tracking-widest text-center font-bold" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} />
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading && <Spinner />}
                {loading ? "Verifying…" : "Verify code"}
              </button>
              <button type="button" onClick={requestOtp} disabled={loading || resendCooldown > 0} className={`w-full min-h-11 text-sm text-primary font-medium disabled:opacity-60 rounded-lg ${focusRing}`}>
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
              </button>
              <button type="button" onClick={() => { setStep("email"); setOtp(""); setError(""); setInfo(""); }} className={`w-full min-h-11 text-sm text-ink-muted hover:text-primary rounded-lg ${focusRing}`}>
                Change email
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={resetPassword} className="space-y-4" noValidate>
              <div>
                <Field label="New password" type={show ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Create a password" value={newPassword} onChange={e => setNewPassword(e.target.value)} trailing={eye(show, () => setShow(!show))} />
                <StrengthMeter password={newPassword} />
              </div>
              <Field label="Confirm password" type={showConfirm ? "text" : "password"} icon={<Lock size={18} />} autoComplete="new-password" placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} error={confirm && newPassword !== confirm ? "Passwords do not match." : undefined} trailing={eye(showConfirm, () => setShowConfirm(!showConfirm))} />
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading && <Spinner />}
                {loading ? "Resetting…" : "Reset password"}
              </button>
            </form>
          )}

          <p className="text-center text-sm pt-2">
            <Link to="/m/login" className={`${linkText} inline-block py-1`}>Back to Sign In</Link>
          </p>
    </MobileAuthShell>
  );
}
