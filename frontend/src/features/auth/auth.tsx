import { createContext, useContext, useState, useRef, useEffect } from "react";
import { isDesktop, isPhone, offlineUser, saveOfflineUser, clearOfflineUser, cacheClear } from "../../lib/offline";
import { SESSION_ENDED, appHeader } from "../../lib/api";
import { Capacitor } from "@capacitor/core";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { secretDelete, secretGet, secretSet } from "../../lib/secrets";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

interface User { id: string; username: string; role: string; permissions: string[]; displayName?: string | null; email?: string | null; avatarUrl?: string | null; memberType?: string | null; position?: string | null; department?: string | null; }
interface AuthCtx { user: User | null; token: string | null; ready: boolean; login: (u: string, p: string) => Promise<boolean | { requiresOtp?: true; requiresActivation?: true; email: string }>; verifyLoginOtp: (username: string, otp: string) => Promise<boolean>; activate: (username: string, code: string) => Promise<boolean>; logout: (expired?: boolean) => void; expired: boolean; hasPerm: (p: string) => boolean; updateUser: (u: Partial<User>) => void; replaceToken: (t: string) => void; lastAuthError: () => { status: number; message?: string; remaining?: number } | null; }

const Ctx = createContext<AuthCtx>({} as AuthCtx);
const TOKEN_KEY = "aklatone_token";

// Where the sign-in token is kept: the phone app keeps it only in memory (sign in again on every start; an older
// token in the keystore is removed), the Desktop app in the OS credential store (lib/secrets.ts), so a copied WebView
// profile does not carry it. The Web keeps localStorage. Desktop falls back to localStorage without a credential store.
const native = Capacitor.isNativePlatform();
async function secureGet(key: string): Promise<string | null> {
  if (isDesktop) {
    try {
      const v = await secretGet(key);
      if (v) return v;
      const old = localStorage.getItem(key);
      if (old) { await secretSet(key, old); localStorage.removeItem(key); }
      return old;
    } catch { return localStorage.getItem(key); }
  }
  return localStorage.getItem(key);
}
function secureSet(key: string, value: string): void {
  // Phone app: the token lives only in memory, so the member signs in again every time the app is opened.
  if (native) return;
  if (isDesktop) { void secretSet(key, value).then(() => localStorage.removeItem(key), () => localStorage.setItem(key, value)); return; }
  if (!native) { localStorage.setItem(key, value); return; }
  void SecureStoragePlugin.set({ key, value }).catch(() => localStorage.setItem(key, value));
}
function secureRemove(key: string): void {
  localStorage.removeItem(key);
  if (native) void SecureStoragePlugin.remove({ key }).catch(() => {});
  if (isDesktop) void secretDelete(key).catch(() => {});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [ready, setReady] = useState(false);
  const timer = useRef<number | null>(null);
  // Why the last login/OTP attempt failed (0 = network). Lets screens tell "wrong password" from "rate limited".
  const lastError = useRef<{ status: number; message?: string; remaining?: number } | null>(null);

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const logout = (expiredFlag = false) => {
    clearTimer();
    setUser(null);
    setToken(null);
    secureRemove(TOKEN_KEY);
    clearOfflineUser();
    // The member's saved loans, receipts and catalog leave the phone with them.
    if (isPhone) cacheClear();
    setExpired(expiredFlag);
  };

  /** A password change signs out other devices; the server returns a new token for this one. */
  const replaceToken = (t: string) => {
    clearTimer();
    setToken(t);
    secureSet(TOKEN_KEY, t);
    try {
      const exp = JSON.parse(atob(t.split(".")[1]!)).exp as number | undefined;
      if (exp) timer.current = window.setTimeout(() => logout(true), Math.max(0, exp * 1000 - Date.now()));
    } catch { /* keep the session; the server still checks the token */ }
  };

  // The server ended this session (account deactivated, password changed elsewhere): sign out on the next 401.
  useEffect(() => {
    const onEnded = () => { if (token) logout(true); };
    window.addEventListener(SESSION_ENDED, onEnded);
    return () => window.removeEventListener(SESSION_ENDED, onEnded);
  });

  const hasPerm = (p: string) => user?.permissions.includes("*") || !!user?.permissions.includes(p);

  const login = async (u: string, p: string) => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appHeader },
        body: JSON.stringify({ username: u, password: p }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { const left = res.headers.get("RateLimit-Remaining"); lastError.current = { status: res.status, message: body?.message, remaining: left === null ? undefined : Number(left) }; return false; }
      lastError.current = null;
      if (body.data.requiresOtp) {
        // 2FA: OTP sent to email, need to verify
        return { requiresOtp: true, email: body.data.email } as const;
      }
      // Self-registered account not activated yet: a new activation code was emailed.
      if (body.data.requiresActivation) return { requiresActivation: true, email: body.data.email } as const;
      setUser(body.data.user);
      setToken(body.data.token);
      secureSet(TOKEN_KEY, body.data.token);
      setExpired(false);
      try {
        const payload = JSON.parse(atob(body.data.token.split(".")[1]));
        if (payload.exp) {
          const ms = payload.exp * 1000 - Date.now();
          if (ms > 0) timer.current = window.setTimeout(() => logout(true), ms);
          else logout(true);
        }
      } catch {}
      return true;
    } catch {
      lastError.current = { status: 0 };
      return false;
    }
  };

  const verifyLoginOtp = (username: string, otp: string) => codeSignIn("/api/v1/auth/verify-login-otp", { username, otp });
  const activate = (username: string, code: string) => codeSignIn("/api/v1/auth/activate", { username, code });
  /** Finishes signing in with an emailed code (2-step sign-in or account activation). */
  const codeSignIn = async (path: string, payload: Record<string, string>) => {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...appHeader },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { const left = res.headers.get("RateLimit-Remaining"); lastError.current = { status: res.status, message: body?.message, remaining: left === null ? undefined : Number(left) }; return false; }
      lastError.current = null;
      setUser(body.data.user);
      setToken(body.data.token);
      secureSet(TOKEN_KEY, body.data.token);
      setExpired(false);
      try {
        const payload = JSON.parse(atob(body.data.token.split(".")[1]));
        if (payload.exp) {
          const ms = payload.exp * 1000 - Date.now();
          if (ms > 0) timer.current = window.setTimeout(() => logout(true), ms);
          else logout(true);
        }
      } catch {}
      return true;
    } catch {
      lastError.current = { status: 0 };
      return false;
    }
  };

  // Restore session from stored token on mount
  // Desktop: remember the signed-in profile so the app opens offline next time.
  useEffect(() => { if (user) saveOfflineUser(user); }, [user]);

  function restore(stored: string | null) {
    if (!stored) { setReady(true); return; }
    // Stay "not ready" until the saved session is checked, so a page refresh doesn't bounce to the login screen.
    // The timeout keeps the app from hanging when the server is unreachable.
    fetch(`${BASE}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${stored}` }, signal: AbortSignal.timeout(10000) })
      .then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))
      .then(({ status, body }) => {
        // Keep the saved session on rate limits (429) and server errors; only a rejected token signs out.
        if (status !== 401 && status !== 403 && status !== 404 && !body?.success) return;
        if (body?.success && body?.data) {
          setUser(body.data);
          setToken(stored);
        } else {
          secureRemove(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => {
        // Desktop / phone app offline: keep working with the last signed-in profile saved on this device.
        const cached = isDesktop || isPhone ? offlineUser<User>() : null;
        if (cached) { setUser(cached); setToken(stored); }
      })
      .finally(() => setReady(true));
  }
  useEffect(() => {
    // Phone app: every start begins at the sign-in screen (nothing is restored; an old saved token is removed).
    if (native) { secureRemove(TOKEN_KEY); clearOfflineUser(); setReady(true); return; }
    void secureGet(TOKEN_KEY).then(restore);
  }, []);

  return <Ctx.Provider value={{ user, token, ready, login, verifyLoginOtp, activate, logout, expired, hasPerm, updateUser: (u: Partial<User>) => setUser(cur => (cur ? { ...cur, ...u } : cur)), replaceToken, lastAuthError: () => lastError.current }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);