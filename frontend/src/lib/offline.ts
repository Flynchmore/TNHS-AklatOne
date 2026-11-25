import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { secretDelete, secretGet, secretSet } from "./secrets";

/**
 * Desktop (Tauri) offline support.
 * - Reads: every successful GET is cached on this computer, and served from the cache when the server can't be reached.
 * - Writes: catalog, copies, members, returns and notices made offline go to an outbox; Upload sends them later.
 * shortcut: cache and outbox live in the WebView's localStorage (kept on disk, ~5 MB); move to a Tauri SQLite store if catalogs outgrow it.
 */
export const isDesktop = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
/** Member phone app (Capacitor): read-only offline copy of the catalog and the member's own records (see mobileApi). */
export const isPhone = Capacitor.isNativePlatform();

const CACHE = "aklatone_cache:";
const OUTBOX = "aklatone_outbox";
const USER = "aklatone_offline_user";

const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const cacheGet = (path: string) => read<{ data: unknown; at: string } | null>(CACHE + path, null);
export const cacheSet = (path: string, data: unknown) => { if (!write(CACHE + path, { data, at: new Date().toISOString() })) cacheClear(); };
/** Storage full (or the member signs out of the phone app): drop the cached lists (the outbox is never dropped). */
export function cacheClear() { try { Object.keys(localStorage).filter(k => k.startsWith(CACHE)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ } }

export const offlineUser = <T,>() => read<T | null>(USER, null);
export const saveOfflineUser = (u: unknown) => { if (isDesktop || isPhone) write(USER, u); };
export const clearOfflineUser = () => { try { localStorage.removeItem(USER); } catch { /* ignore */ } };

export type OutboxKind = "book" | "copy" | "member" | "return" | "notice" | "lend";
export interface OutboxItem { id: string; kind: OutboxKind; label: string; method: string; path: string; body?: string; headers?: Record<string, string>; createdAt: string; error?: string; /** The member password is in the OS credential store, not in this item. */ secret?: boolean }

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
let snapshot: OutboxItem[] = read<OutboxItem[]>(OUTBOX, []);
const save = (items: OutboxItem[]) => { snapshot = items; write(OUTBOX, items); emit(); };

export const outbox = () => snapshot;
const secretKey = (id: string) => `aklatone_outbox_${id}`;

/**
 * Queues a write. A member password in the body is moved to the computer's credential store, so it never sits in
 * the WebView files; if the computer has no credential store the item keeps it as before (nothing is lost).
 */
export async function enqueue(item: Omit<OutboxItem, "id" | "createdAt">) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let entry: OutboxItem = { ...item, id, createdAt: new Date().toISOString() };
  const body = (() => { try { return item.body ? (JSON.parse(item.body) as Record<string, unknown>) : null; } catch { return null; } })();
  if (isDesktop && body && typeof body.password === "string" && body.password) {
    try {
      await secretSet(secretKey(id), body.password);
      const { password: _omit, ...rest } = body;
      entry = { ...entry, body: JSON.stringify(rest), secret: true };
    } catch { /* no credential store on this computer: keep the password in the item */ }
  }
  save([...snapshot, entry]);
}
/** The body to upload, with the password put back from the credential store. */
export async function outboxBody(item: OutboxItem): Promise<string | undefined> {
  if (!item.secret || !item.body) return item.body;
  const password = await secretGet(secretKey(item.id)).catch(() => null);
  return password ? JSON.stringify({ ...JSON.parse(item.body), password }) : item.body;
}
export const removeOutbox = (id: string) => {
  if (snapshot.find(i => i.id === id)?.secret) void secretDelete(secretKey(id)).catch(() => {});
  save(snapshot.filter(i => i.id !== id));
};
export const markOutbox = (id: string, error?: string) => save(snapshot.map(i => (i.id === id ? { ...i, error } : i)));

export function useOutbox() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, outbox, outbox);
}

// "Online" means the AklatOne server answers, not just that a network cable is plugged in.
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
let reachable = typeof navigator === "undefined" ? true : navigator.onLine;
const onlineListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
export async function checkOnline() {
  let ok = navigator.onLine;
  if (ok && isDesktop) { try { ok = (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000), cache: "no-store" })).ok; } catch { ok = false; } }
  if (ok !== reachable) { reachable = ok; onlineListeners.forEach(l => l()); }
  return ok;
}
const subscribeOnline = (cb: () => void) => {
  onlineListeners.add(cb);
  const recheck = () => { void checkOnline(); };
  window.addEventListener("online", recheck); window.addEventListener("offline", recheck);
  if (onlineListeners.size === 1) { recheck(); if (isDesktop) timer = setInterval(recheck, 15000); }
  return () => {
    onlineListeners.delete(cb);
    window.removeEventListener("online", recheck); window.removeEventListener("offline", recheck);
    if (!onlineListeners.size && timer) { clearInterval(timer); timer = undefined; }
  };
};
/** The phone app reports whether its last request reached the server (navigator.onLine alone misses a server that is down). */
export function setReachable(ok: boolean) { if (ok !== reachable) { reachable = ok; onlineListeners.forEach(l => l()); } }
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => reachable, () => true);
}

/** Toast shown when a change was kept on this computer instead of sent. */
export const queuedToast = { tone: "info" as const, title: "Saved on this computer", message: "No internet right now. Open Upload when you're back online to send it to the web." };

export interface UploadResult { sent: number; failed: number; stopped?: "offline" | "signin" }
/**
 * Sends the outbox in order. Items the server accepts are removed; items it rejects stay with the reason (skip and show).
 * Stops early when the connection drops or the session has expired, keeping everything not yet sent.
 */
/** Headers for sending an outbox item: the item id doubles as the Idempotency-Key, so a retried upload runs only once. */
export const outboxHeaders = (item: OutboxItem): Record<string, string> => ({ ...item.headers, "Idempotency-Key": `outbox-${item.id}` });

export async function uploadOutbox(send: (item: OutboxItem) => Promise<{ ok: boolean; status: number; message?: string }>): Promise<UploadResult> {
  const result: UploadResult = { sent: 0, failed: 0 };
  for (const item of [...snapshot]) {
    const r = await send(item);
    if (r.status === 0) return { ...result, stopped: "offline" };
    if (r.status === 401) return { ...result, stopped: "signin" };
    if (r.ok) { removeOutbox(item.id); result.sent++; }
    else { markOutbox(item.id, r.message ?? `Rejected by the server (${r.status})`); result.failed++; }
  }
  return result;
}

/** Borrowing page path (the Desktop app used to call it "Transactions"; the old address still redirects). */
export const txPath = "/borrowing";
