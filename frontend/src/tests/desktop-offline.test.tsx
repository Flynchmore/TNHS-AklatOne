import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { phDate, phDateTime, phISODate, phHour, phDayEnd } from "../lib/dates";

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data }), { status });

describe("Philippine dates", () => {
  it("uses Manila time whatever the computer's zone is", () => {
    // 23:30 UTC on Nov 19 is 7:30 AM on Nov 20 in Manila; toISOString would say the 19th.
    const t = Date.UTC(2026, 10, 19, 23, 30);
    expect(phISODate(t)).toBe("2026-11-20");
    expect(phHour(t)).toBe(7);
    expect(phDate(t)).toBe("Nov 20, 2026");
    expect(phDateTime(t)).toMatch(/^Nov 20, 2026, 7:30\s?AM$/i);
    expect(phDayEnd("2026-11-20")).toBe("2026-11-20T23:59:59.999+08:00");
    expect(phDate(null)).toBe("—");
  });
});

describe("desktop offline", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("serves cached lists offline and keeps allowed writes for Upload", async () => {
    const { apiFetch } = await import("../lib/api");
    const { outbox } = await import("../lib/offline");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ items: [{ id: "b1" }] }));
    expect((await apiFetch("/api/v1/catalog")).data).toEqual({ items: [{ id: "b1" }] });

    f.mockRejectedValue(new TypeError("Failed to fetch"));
    const cached = await apiFetch("/api/v1/catalog");
    expect(cached).toMatchObject({ ok: true, offline: true, data: { items: [{ id: "b1" }] } });

    const queued = await apiFetch("/api/v1/catalog", { method: "POST", body: '{"title":"New"}', offline: { kind: "book", label: 'Add book "New"' } });
    expect(queued).toMatchObject({ ok: true, queued: true });
    expect(outbox()).toEqual([expect.objectContaining({ kind: "book", method: "POST", path: "/api/v1/catalog", body: '{"title":"New"}' })]);

    // Writes without an offline permission still fail (e.g. deleting a book needs the internet).
    expect(await apiFetch("/api/v1/catalog/b1", { method: "DELETE" })).toMatchObject({ ok: false, status: 0 });
    expect(outbox()).toHaveLength(1);
  });

  it("upload sends in order, skips rejected items with the reason, and stops when offline", async () => {
    const { enqueue, outbox, uploadOutbox } = await import("../lib/offline");
    enqueue({ kind: "member", label: "Add member A", method: "POST", path: "/a" });
    enqueue({ kind: "member", label: "Add member B", method: "POST", path: "/b" });
    enqueue({ kind: "return", label: "Return C", method: "POST", path: "/c" });
    enqueue({ kind: "notice", label: "Notice D", method: "POST", path: "/d" });
    const replies: Record<string, { ok: boolean; status: number; message?: string }> = {
      "/a": { ok: true, status: 201 }, "/b": { ok: false, status: 409, message: "That username is already taken." }, "/c": { ok: true, status: 200 }, "/d": { ok: false, status: 0 },
    };
    const r = await uploadOutbox(async i => replies[i.path]!);
    expect(r).toEqual({ sent: 2, failed: 1, stopped: "offline" });
    expect(outbox().map(i => [i.label, i.error])).toEqual([["Add member B", "That username is already taken."], ["Notice D", undefined]]);
  });

  it("queued edits keep their conflict header and are uploaded with a stable Idempotency-Key", async () => {
    const { apiFetch } = await import("../lib/api");
    const { outbox, outboxHeaders } = await import("../lib/offline");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await apiFetch("/api/v1/users/u1", { method: "PATCH", token: "t", body: "{}", headers: { "X-Expected-Updated-At": "2026-11-24T01:00:00.000Z" }, offline: { kind: "member", label: "Edit member" } });
    const item = outbox().at(-1)!;
    expect(item.headers).toEqual({ "X-Expected-Updated-At": "2026-11-24T01:00:00.000Z" });
    const h = outboxHeaders(item);
    expect(h["Idempotency-Key"]).toMatch(/^outbox-[A-Za-z0-9_-]{8,}$/);
    // Same item, same key on every retry.
    expect(outboxHeaders(item)["Idempotency-Key"]).toBe(h["Idempotency-Key"]);
  });

  it("a 401 on a signed-in request tells the app the session ended", async () => {
    const { apiFetch, SESSION_ENDED } = await import("../lib/api");
    const seen = vi.fn();
    window.addEventListener(SESSION_ENDED, seen);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 401 }));
    await apiFetch("/api/v1/auth/me", { token: "old" });
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_ENDED, seen);
  });

  it("an offline member password goes to the credential store, not the outbox, and comes back at upload", async () => {
    const store = new Map<string, string>();
    vi.doMock("../lib/secrets", () => ({
      secretSet: async (k: string, v: string) => { store.set(k, v); },
      secretGet: async (k: string) => store.get(k) ?? null,
      secretDelete: async (k: string) => { store.delete(k); },
    }));
    const { enqueue, outbox, outboxBody, removeOutbox } = await import("../lib/offline");
    await enqueue({ kind: "member", label: "Add member", method: "POST", path: "/api/v1/users", body: JSON.stringify({ username: "m1", password: "Offline-Pass-2026!" }) });
    const item = outbox().at(-1)!;
    expect(item.secret).toBe(true);
    expect(item.body).not.toContain("Offline-Pass-2026!");
    expect(localStorage.getItem("aklatone_outbox")).not.toContain("Offline-Pass-2026!");
    expect(JSON.parse((await outboxBody(item))!)).toEqual({ username: "m1", password: "Offline-Pass-2026!" });
    removeOutbox(item.id);
    await new Promise(r => setTimeout(r, 0));
    expect(store.size).toBe(0);
  });

  it("without a credential store the password stays in the item (nothing is lost)", async () => {
    vi.doMock("../lib/secrets", () => ({ secretSet: async () => { throw new Error("no store"); }, secretGet: async () => null, secretDelete: async () => {} }));
    const { enqueue, outbox, outboxBody } = await import("../lib/offline");
    await enqueue({ kind: "member", label: "Add member", method: "POST", path: "/api/v1/users", body: JSON.stringify({ username: "m2", password: "Offline-Pass-2026!" }) });
    const item = outbox().at(-1)!;
    expect(item.secret).toBeUndefined();
    expect(await outboxBody(item)).toContain("Offline-Pass-2026!");
  });

  it("desktop side nav matches the web, plus Upload", async () => {
    const { navLinks } = await import("../components/Layout");
    expect(navLinks(true).map(l => l.label)).toEqual(["Dashboard", "Catalog", "Borrowing", "Visitor's Log", "Members", "Suggestions", "Reports", "Printing", "School Newspaper", "Upload", "Settings"]);
    expect(navLinks(false).map(l => l.label)).toEqual(["Dashboard", "Catalog", "Borrowing", "Visitor's Log", "Members", "Suggestions", "Reports", "Printing", "School Newspaper", "Settings"]);
  });
});

describe("printing signatories", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });
  it("defaults to the LRMDS coordinator and the principal, and keeps edits per list", async () => {
    const { loadSignatories, DEFAULT_SIGNATORIES, SCHOOL_ID } = await import("../features/printing/Printing");
    expect(SCHOOL_ID).toBe("308114");
    expect(loadSignatories("inventory")).toEqual(DEFAULT_SIGNATORIES);
    expect(DEFAULT_SIGNATORIES).toMatchObject({ preparedName: "CHRISTOPHER L. CHUA", preparedTitle: "Head Teacher I / LRMDS Coordinator", notedName: "LEANDRO D. MATOCIÑOS", notedTitle: "Principal III" });
    localStorage.setItem("aklatone_signatories:overdue", JSON.stringify({ notedName: "ACTING PRINCIPAL" }));
    expect(loadSignatories("overdue").notedName).toBe("ACTING PRINCIPAL");
    expect(loadSignatories("inventory").notedName).toBe("LEANDRO D. MATOCIÑOS");
    render(<p>{SCHOOL_ID}</p>);
    expect(screen.getByText("308114")).toBeInTheDocument();
  });
});
