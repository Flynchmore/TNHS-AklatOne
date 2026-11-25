import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@capacitor/core", async (orig) => {
  const real = await orig<typeof import("@capacitor/core")>();
  return { ...real, Capacitor: { ...real.Capacitor, isNativePlatform: () => true, getPlatform: () => "android" } };
});
import { mobileApi } from "../components/mobile/ui";
import { cacheClear, cacheGet } from "../lib/offline";

const okJson = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200 }));

describe("phone app: read-only offline copy", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("serves saved loans when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ items: [{ id: "t1" }] })));
    expect((await mobileApi("/api/v1/circulation/transactions?mine=1", { token: "x" })).offline).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const r = await mobileApi("/api/v1/circulation/transactions?mine=1", { token: "x" });
    expect(r).toMatchObject({ ok: true, offline: true, data: { items: [{ id: "t1" }] } });
  });

  it("never saves or fakes changes, and keeps only the listed screens", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ ok: 1 })));
    await mobileApi("/api/v1/borrow-requests", { method: "POST", token: "x", body: "{}" });
    await mobileApi("/api/v1/notifications/mine", { token: "x" });
    expect(cacheGet("/api/v1/borrow-requests")).toBeNull();
    expect(cacheGet("/api/v1/notifications/mine")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const w = await mobileApi("/api/v1/borrow-requests", { method: "POST", token: "x", body: "{}" });
    expect(w.ok).toBe(false);
    expect(w.message).toMatch(/Can't reach/);
  });

  it("sign-out clears the saved copy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ items: [] })));
    await mobileApi("/api/v1/catalog?limit=20", { token: "x" });
    expect(cacheGet("/api/v1/catalog?limit=20")).not.toBeNull();
    cacheClear();
    expect(cacheGet("/api/v1/catalog?limit=20")).toBeNull();
  });
});
