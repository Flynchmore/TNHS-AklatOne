import { Capacitor } from "@capacitor/core";
import { cacheGet, cacheSet, enqueue, isDesktop, isPhone, type OutboxKind } from "./offline";

/** Tells the server which app sends a request, so Settings > Sign-in devices can name the device (web, desktop, android, ios). */
export const appHeader = { "X-AklatOne-App": isDesktop ? "desktop" : isPhone ? Capacitor.getPlatform() : "web" };

/** Window event fired when the server rejects the saved token (handled by the auth provider). */
export const SESSION_ENDED = "aklatone:session-ended";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export function apiUrl(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : "/" + path}`;
}

export async function api<T = any>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...appHeader, ...(init?.headers as Record<string, string> | undefined) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...init, headers });
  const body = await res.json().catch(() => null);
  return body;
}

export interface ApiResult { ok: boolean; status: number; data: unknown; message?: string; /** Desktop: served from this computer's cache. */ offline?: boolean; /** Desktop: saved to the Upload outbox instead of sent. */ queued?: boolean }

/**
 * fetch wrapper. On the Desktop app: GETs are cached and served from the cache when the server can't be reached,
 * and writes that pass `offline` are saved to the Upload outbox (status 202, queued) instead of failing.
 */
export async function apiFetch(path: string, init?: RequestInit & { token?: string | null; offline?: { kind: OutboxKind; label: string } }): Promise<ApiResult> {
  const { token, offline, ...rest } = init ?? {};
  const method = (rest.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...appHeader, ...(rest.headers as Record<string, string> | undefined) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(apiUrl(path), { ...rest, headers });
    const body = await res.json().catch(() => null);
    // A signed-in request rejected as unauthenticated means the session was ended on the server.
    if (res.status === 401 && token) window.dispatchEvent(new Event(SESSION_ENDED));
    if (isDesktop && method === "GET" && res.ok) cacheSet(path, body?.data ?? null);
    return { ok: res.ok, status: res.status, data: body?.data ?? null, message: body?.message };
  } catch {
    if (isDesktop && method === "GET") {
      const cached = cacheGet(path);
      if (cached) return { ok: true, status: 200, data: cached.data, message: `Offline copy from ${cached.at}`, offline: true };
    }
    if (isDesktop && offline && method !== "GET") {
      // Extra headers (e.g. X-Expected-Updated-At for conflict checks) travel with the item; auth/content-type are added at upload.
      const extra = Object.fromEntries(Object.entries((rest.headers as Record<string, string> | undefined) ?? {}).filter(([k]) => !/^(authorization|content-type)$/i.test(k)));
      await enqueue({ ...offline, method, path, ...(typeof rest.body === "string" ? { body: rest.body } : {}), ...(Object.keys(extra).length ? { headers: extra } : {}) });
      return { ok: true, status: 202, data: null, message: "Saved on this computer", queued: true };
    }
    return { ok: false, status: 0, data: null, message: "Network error" };
  }
}
