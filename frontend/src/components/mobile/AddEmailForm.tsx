import { useState } from "react";
import { Mail, KeyRound } from "lucide-react";
import { useAuth } from "../../features/auth/auth";
import { apiFetch } from "../../lib/api";
import { Alert, Field, Spinner, btnPrimary, focusRing } from "./ui";

/**
 * Every account needs an email (sign-in codes are sent there). An older account without one adds it right after the
 * correct password: type the email, then the 6-digit code sent to it. Used by the phone and the staff sign-in.
 */
export function AddEmailForm({ emailToken, onDone, onBack }: { emailToken: string; onDone: () => void; onBack: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Please enter a valid email."); return; }
    setBusy(true);
    const r = await apiFetch("/api/v1/auth/email/send", { method: "POST", body: JSON.stringify({ emailToken, email: email.trim() }) });
    setBusy(false);
    if (r.ok) setSentTo((r.data as { email: string }).email);
    else setError(r.status === 401 ? "This step has expired. Please sign in again." : r.message ?? "The code was not sent. Please try again.");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) { setError("Please enter the 6-digit code."); return; }
    setBusy(true);
    setError("");
    const ok = await auth.verifyEmail(emailToken, email.trim(), code);
    setBusy(false);
    if (ok) onDone();
    else setError(auth.lastAuthError?.()?.message ?? "That code is wrong or has expired.");
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">Your account needs an email address. Sign-in codes are sent there to keep your account safe.</Alert>
      {error && <Alert>{error}</Alert>}
      {!sentTo ? (
        <form onSubmit={send} className="space-y-4" noValidate>
          <Field label="Your email" type="email" rule="email" icon={<Mail size={18} />} autoComplete="email" autoCapitalize="none" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Spinner />}{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-sm text-ink-muted">Enter the 6-digit code sent to <strong className="text-ink">{sentTo}</strong>.</p>
          <Field label="6-digit code" icon={<KeyRound size={18} />} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="tracking-widest text-center font-bold" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
          <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Spinner />}{busy ? "Checking…" : "Confirm email & sign in"}</button>
          <button type="button" onClick={() => { setSentTo(""); setCode(""); }} className={`w-full min-h-11 text-sm text-primary font-medium rounded-lg ${focusRing}`}>Use a different email</button>
        </form>
      )}
      <button type="button" onClick={onBack} className={`w-full min-h-11 text-sm text-ink-muted hover:text-primary rounded-lg ${focusRing}`}>Back</button>
    </div>
  );
}
