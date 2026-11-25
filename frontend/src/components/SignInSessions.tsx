import { useCallback, useEffect, useState } from "react";
import { Monitor, Smartphone, LogOut, ShieldCheck, Lock, KeyRound } from "lucide-react";
import { apiFetch } from "../lib/api";
import { phDateTime } from "../lib/dates";
import { useAuth } from "../features/auth/auth";
import { useToast } from "./Toast";

interface SignIn { id: string; device: string; network: string; createdAt: string; lastSeenAt: string; current: boolean }
type Target = { kind: "one"; s: SignIn } | { kind: "others" };

const field = "w-full min-h-11 rounded-2xl border border-line-strong bg-surface px-4 text-ink focus-visible:outline-2 focus-visible:outline-primary";
const primaryBtn = "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-2xl font-semibold text-on-primary bg-gradient-to-br from-danger to-danger-strong disabled:opacity-60";
const plainBtn = "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-2xl font-semibold border border-line-strong text-ink bg-surface";

/**
 * Settings > Sign-in devices (Staff Web, Desktop and the phone app): every device signed in to this account, and a way
 * to sign one (or all others) out. Signing out asks for the password and, for accounts with an email, a 6-digit code.
 */
export function SignInSessions() {
  const { token, replaceToken } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<SignIn[] | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [emailHint, setEmailHint] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch("/api/v1/auth/sessions", { token });
    if (r.ok) { setItems((r.data as { items: SignIn[] }).items); setError(""); } else setError(r.message ?? "Could not load your devices.");
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const sendCode = async () => {
    const r = await apiFetch("/api/v1/auth/sessions/code", { method: "POST", token });
    if (!r.ok) { setFormError(r.message ?? "Could not send the code."); return; }
    const d = r.data as { needsCode: boolean; email?: string };
    setNeedsCode(d.needsCode); setEmailHint(d.email ?? "");
  };
  const open = (t: Target) => { setTarget(t); setPassword(""); setCode(""); setFormError(""); setNeedsCode(false); void sendCode(); };
  const close = () => setTarget(null);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true); setFormError("");
    const body = { ...(target.kind === "one" ? { sessionId: target.s.id } : { others: true }), password, ...(needsCode ? { code } : {}) };
    const r = await apiFetch("/api/v1/auth/sessions/revoke", { method: "POST", token, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setFormError(r.message ?? "Not signed out. Please try again."); return; }
    const d = r.data as { signedOut: number; token?: string };
    if (d.token) replaceToken(d.token);
    toast({ tone: "success", title: "Signed out", message: target.kind === "one" ? `${target.s.device} can no longer use your account.` : `${d.signedOut} other device(s) can no longer use your account.` });
    close();
    void load();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Devices signed in to your account. If you see one you do not know, sign it out and change your password.</p>
      {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" onClick={() => void load()} className="underline">Try again</button></p>}
      {!items && !error && <div role="status" className="space-y-2"><span className="sr-only">Loading devices…</span>{[0, 1].map(i => <div key={i} aria-hidden="true" className="h-16 rounded-2xl border border-line bg-surface motion-safe:animate-pulse" />)}</div>}
      <ul className="space-y-2">
        {items?.map(s => {
          const Icon = /app on|Android|iPhone/.test(s.device) ? Smartphone : Monitor;
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center" aria-hidden="true"><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{s.device}{s.current && <span className="ml-2 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full bg-success-soft text-success">This device</span>}</span>
                <span className="block text-xs text-ink-muted">{s.network}</span>
                <span className="block text-xs text-ink-muted">Signed in {phDateTime(s.createdAt)} · Last active {phDateTime(s.lastSeenAt)}</span>
              </span>
              {!s.current && <button type="button" onClick={() => open({ kind: "one", s })} className={`${plainBtn} !min-h-10 !px-3 text-sm`}><LogOut size={16} aria-hidden="true" />Sign out</button>}
            </li>
          );
        })}
      </ul>
      {items && items.filter(s => !s.current).length > 1 && (
        <button type="button" onClick={() => open({ kind: "others" })} className={`${plainBtn} w-full text-danger`}><LogOut size={18} aria-hidden="true" />Sign out all other devices</button>
      )}

      {target && (
        <form onSubmit={confirm} className="rounded-2xl border-2 border-danger/40 bg-surface p-4 space-y-3" aria-labelledby="signout-title">
          <p id="signout-title" className="font-bold text-ink flex items-center gap-2"><ShieldCheck size={18} className="text-danger" aria-hidden="true" />{target.kind === "one" ? `Sign out ${target.s.device}?` : "Sign out all other devices?"}</p>
          <p className="text-sm text-ink-muted">To protect your account, confirm it is you.</p>
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <label className="block">
            <span className="block text-sm font-semibold text-ink mb-1 flex items-center gap-1"><Lock size={14} aria-hidden="true" />Your password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={field} />
          </label>
          {needsCode && (
            <label className="block">
              <span className="block text-sm font-semibold text-ink mb-1 flex items-center gap-1"><KeyRound size={14} aria-hidden="true" />6-digit code sent to {emailHint || "your email"}</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className={`${field} font-mono tracking-[0.3em]`} />
              <button type="button" onClick={() => void sendCode()} className="text-xs text-primary underline mt-1">Send a new code</button>
            </label>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={close} className={plainBtn}>Cancel</button>
            <button type="submit" disabled={busy || !password || (needsCode && code.length !== 6)} className={primaryBtn}><LogOut size={18} aria-hidden="true" />{busy ? "Signing out…" : "Sign out"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
