import { useEffect } from "react";
import { apiFetch } from "../../lib/api";

/** Per-day usage on this phone: date (YYYY-MM-DD, local) -> [seconds in the app, times opened]. */
export type Usage = Record<string, [number, number]>;

const key = (userId: string) => `aklatone_screen_${userId}`;
export const dayKey = (t: number) => new Date(t).toLocaleDateString("en-CA");
const KEEP_DAYS = 31;

export function readUsage(userId: string): Usage {
  try { return JSON.parse(localStorage.getItem(key(userId)) ?? "null") ?? {}; } catch { return {}; }
}

/** Adds time (and optionally one "open") to today's entry and drops entries older than a month. */
export function addUsage(u: Usage, seconds: number, opens: number, now: number): Usage {
  const d = dayKey(now);
  const [s, o] = u[d] ?? [0, 0];
  const next: Usage = { ...u, [d]: [s + seconds, o + opens] };
  const oldest = dayKey(now - KEEP_DAYS * 86400000);
  for (const k of Object.keys(next)) if (k < oldest) delete next[k];
  return next;
}

/** The last `n` days, oldest first, with zeros for days the app was not used. */
export function lastDays(u: Usage, n: number, now: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = now - (n - 1 - i) * 86400000;
    const [seconds, opens] = u[dayKey(t)] ?? [0, 0];
    return { date: dayKey(t), label: new Date(t).toLocaleDateString(undefined, { weekday: "short" }), seconds, opens };
  });
}

export const fmtDuration = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

const TICK_MS = 15000;
const REOPEN_AFTER_MS = 30000; // coming back after 30 s away counts as opening the app again

// --- Time Spent on the server: seconds waiting to be sent, per Philippine day (kept while offline) ---
const PENDING = "aklatone_apptime_pending";
export type Platform = "mobile" | "web" | "desktop";
export const phDayKey = (t: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(t);
const readPending = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(PENDING) ?? "{}") as Record<string, number>; } catch { return {}; } };
/** Adds seconds to today's not-yet-sent time; keeps only the last 8 days (the server accepts no older). */
export function addPending(p: Record<string, number>, seconds: number, now: number): Record<string, number> {
  const d = phDayKey(now);
  const next = { ...p, [d]: (p[d] ?? 0) + seconds };
  const oldest = phDayKey(now - 7 * 86400000);
  for (const k of Object.keys(next)) if (k < oldest) delete next[k];
  return next;
}
let sending = false;
/** Sends the collected time; on failure (offline) it stays for the next try. */
export async function flushAppTime(token: string | null, platform: Platform) {
  const pending = readPending();
  const days = Object.entries(pending).filter(([, s]) => s > 0).map(([day, seconds]) => ({ day, seconds: Math.min(86400, Math.round(seconds)) }));
  if (!token || sending || !days.length) return;
  sending = true;
  try {
    const r = await apiFetch("/api/v1/time/usage", { method: "POST", token, body: JSON.stringify({ platform, days }) });
    if (r.ok) {
      // Keep only time added while the request was in flight.
      const now = readPending();
      for (const { day, seconds } of days) now[day] = Math.max(0, (now[day] ?? 0) - seconds);
      try { localStorage.setItem(PENDING, JSON.stringify(now)); } catch { /* ignore */ }
    }
  } finally { sending = false; }
}

/**
 * Counts time while the app is visible. Kept on this device for the phone's own chart, and sent to the server
 * (Time Spent) every minute; members and librarians both count. Not used by the Visitor's Log kiosk.
 */
export function useScreenTimeTracker(userId: string | undefined, token?: string | null, platform: Platform = "mobile") {
  useEffect(() => {
    if (!userId || !token) return;
    const flush = setInterval(() => { void flushAppTime(token, platform); }, 60_000);
    return () => { clearInterval(flush); void flushAppTime(token, platform); };
  }, [userId, token, platform]);
  useEffect(() => {
    if (!userId) return;
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    let hiddenAt = 0;
    const save = (opens = 0) => {
      const now = Date.now();
      // Cap each chunk so a sleeping phone that never fired "hidden" does not add hours.
      const secs = since ? Math.min(60, Math.round((now - since) / 1000)) : 0;
      since = document.visibilityState === "visible" ? now : 0;
      if (!secs && !opens) return;
      try { localStorage.setItem(key(userId), JSON.stringify(addUsage(readUsage(userId), secs, opens, now))); } catch { /* storage full or blocked */ }
      if (secs) try { localStorage.setItem(PENDING, JSON.stringify(addPending(readPending(), secs, now))); } catch { /* storage full or blocked */ }
    };
    save(1);
    const tick = setInterval(() => save(), TICK_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") { save(); hiddenAt = Date.now(); since = 0; }
      else { since = Date.now(); if (hiddenAt && Date.now() - hiddenAt > REOPEN_AFTER_MS) save(1); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVis); save(); };
  }, [userId]);
}
