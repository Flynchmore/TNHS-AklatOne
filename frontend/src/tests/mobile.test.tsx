import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import css from "../index.css?raw";

const authState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../features/auth/auth", () => ({ useAuth: () => authState.value }));

import { MobileLogin } from "../features/mobile/MobileLogin";
import { MobileCatalog, pageList, availabilityText, VIEW_AFTER_MS } from "../features/mobile/MobileCatalog";
import { act } from "@testing-library/react";
import { MobileHistory } from "../features/mobile/MobileHistory";
import { MobileHome } from "../features/mobile/MobileHome";
import { MobileLayout } from "../components/mobile/MobileLayout";
import { loanStatus } from "../components/mobile/ui";
import { ToastProvider } from "../components/Toast";
import { MobileLoans, dueChip } from "../features/mobile/MobileLoans";
import { MobileNotifications, timeAgo, groupByDay } from "../features/mobile/MobileNotifications";
import { computeBadges } from "../components/mobile/MobileLayout";
import { SwipeToDelete } from "../components/mobile/SwipeToDelete";
import { Receipt } from "../components/Receipt";
import { MobileProfile, monthlyBorrows, returnBreakdown } from "../features/mobile/MobileProfile";
import { MobileSettings } from "../features/mobile/MobileSettings";
import { addUsage, lastDays, fmtDuration } from "../components/mobile/screenTime";
import { clampOffset, cropSource } from "../components/mobile/PhotoCropper";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const at = (path: string, ui: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

// WCAG relative luminance / contrast ratio.
const lum = (hex: string) => {
  const c = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

afterEach(cleanup);

describe("Member Mobile design tokens", () => {
  // Light (default) tokens only: the @theme block, not the dark-mode overrides further down.
  const t = Object.fromEntries([...css.slice(0, css.indexOf(":root.ak-dark")).matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));

  it("uses the approved primary", () => expect(t.primary.toUpperCase()).toBe("#3354B5"));

  it.each([
    ["ink", "surface", 4.5], ["ink", "page", 4.5], ["ink-muted", "surface", 4.5], ["ink-muted", "page", 4.5], ["ink-muted", "primary-soft", 4.5],
    ["primary", "surface", 4.5], ["primary", "page", 4.5], ["primary", "primary-soft", 4.5], ["on-primary", "primary", 4.5], ["on-primary", "primary-strong", 4.5],
    ["danger", "surface", 4.5], ["danger", "danger-soft", 4.5], ["on-primary", "danger", 4.5], ["success", "success-soft", 4.5], ["warning", "warning-soft", 4.5],
    ["info", "info-soft", 4.5], ["on-accent", "accent", 4.5],
    ["on-primary", "success", 4.5], ["on-primary", "success-strong", 4.5], ["on-accent", "accent-soft", 4.5], ["on-accent", "accent-strong", 4.5],
    ["line-strong", "surface", 3], ["line-strong", "page", 3], ["focus", "surface", 3], ["focus", "page", 3],
  ])("%s on %s meets %s:1", (fg, bg, min) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min as number);
  });

  it("Member Mobile files contain no hard-coded hex colors", () => {
    const files = import.meta.glob<string>(["../features/mobile/*.tsx", "../components/mobile/*.tsx"], { query: "?raw", import: "default", eager: true });
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(10);
    const offenders = Object.entries(files).filter(([, src]) => /#[0-9A-Fa-f]{6}\b/.test(src)).map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe("Member Mobile screens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.value = { ready: true, user: null, token: null, login: vi.fn(), verifyLoginOtp: vi.fn() };
  });

  it("login fields have programmatic labels and the password toggle has a name", () => {
    at("/m/login", <MobileLogin />);
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("login says the server is unreachable instead of 'invalid password' when the backend is down", async () => {
    authState.value.login = vi.fn().mockResolvedValue(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    at("/m/login", <MobileLogin />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member1" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach the aklatone server/i);
  });

  it("login explains a rate limit instead of blaming the password", async () => {
    authState.value.login = vi.fn().mockResolvedValue(false);
    authState.value.lastAuthError = () => ({ status: 429, message: "Too many sign-in attempts." });
    at("/m/login", <MobileLogin />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member1" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "right-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
  });

  it("login reports invalid credentials when the server is reachable", async () => {
    authState.value.login = vi.fn().mockResolvedValue(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ success: true, data: { status: "ok" } }));
    at("/m/login", <MobileLogin />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "member1" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
  });

  it("catalog search is labelled, shows a network error with retry, and recovers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(json({ data: { items: [{ id: "b1", title: "Fictional Atlas", authors: "A. Writer", availability: { total: 2, available: 1 } }] } }));
    at("/m/catalog?q=atlas", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    expect(screen.getByLabelText(/search the catalog/i)).toHaveValue("atlas");
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Fictional Atlas")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 available")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=atlas");
  });

  it("catalog filters send category, availability and sort to the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => String(url).includes("/categories")
      ? json({ data: { items: [{ id: "c1", name: "English", kind: "SUBJECT" }] } })
      : json({ data: { items: [], total: 0 } }));
    at("/m/catalog", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    fireEvent.click(await screen.findByRole("button", { name: /Filters/ }));
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "c1" } });
    fireEvent.click(screen.getByLabelText("Available now only"));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "createdAt:desc" } });
    await waitFor(() => {
      const last = String(fetchMock.mock.calls.filter(c => String(c[0]).includes("/catalog?")).at(-1)![0]);
      expect(last).toContain("categoryId=c1");
      expect(last).toContain("available=1");
      expect(last).toContain("sortBy=createdAt&sortOrder=desc");
    });
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("3");
  });

  it("history marks only past-due ACTIVE loans as overdue", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1" } };
    const past = new Date(Date.now() - 2 * 86400000).toISOString();
    const future = new Date(Date.now() + 5 * 86400000).toISOString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [
      { id: "1", status: "ACTIVE", dueAt: past, bookCopy: { book: { title: "Late Book" } } },
      { id: "2", status: "ACTIVE", dueAt: future, bookCopy: { book: { title: "On-time Book" } } },
      { id: "3", status: "RETURNED", bookCopy: { book: { title: "Done Book" } } },
    ] } }));
    at("/m/history", <MobileHistory />);
    await screen.findByText("Late Book");
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
    expect(screen.getByText("Borrowed", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(screen.getByText("Returned on time", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE")).not.toBeInTheDocument();
  });

  it("home shows only school catalog books: no fake rating and no internet fallback", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1" } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [] } }));
    at("/m", <MobileHome />);
    expect(await screen.findByText("No books in the library catalog yet.")).toBeInTheDocument();
    expect(screen.queryByText("4.5")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(c => /(^|\.)openlibrary\.org$/.test(new URL(String(c[0]), "http://localhost").hostname))).toBe(false);
    expect(screen.queryByRole("link", { name: /borrow|reserve/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search the library catalog")).toBeInTheDocument();
  });

  it("home greets the member once per sign-in", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "juan", displayName: "Juan Cruz" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [] } }));
    sessionStorage.clear();
    at("/m", <ToastProvider><MobileHome /></ToastProvider>);
    expect(await screen.findByText("Signed in successfully")).toBeInTheDocument();
    expect(screen.getByText("Welcome back, Juan!")).toBeInTheDocument();
    expect(sessionStorage.getItem("aklatone_welcome_shown")).toBe("1");
  });

  it("loanStatus labels every librarian outcome in plain language", () => {
    const now = Date.now();
    expect(loanStatus({ status: "RETURNED", outcome: "RETURNED_ON_TIME" }, now).text).toBe("Returned on time");
    expect(loanStatus({ status: "RETURNED", outcome: "RETURNED_LATE" }, now).text).toBe("Returned late");
    expect(loanStatus({ status: "RETURNED", outcome: "DAMAGED" }, now).text).toBe("Returned torn");
    expect(loanStatus({ status: "LOST", outcome: "MISSING" }, now).text).toBe("Missing");
    expect(loanStatus({ status: "ACTIVE", dueAt: new Date(now - 1000).toISOString() }, now).text).toBe("Overdue");
    expect(loanStatus({ status: "ACTIVE", dueAt: new Date(now + 86400000).toISOString() }, now).text).toBe("Borrowed");
  });

  it("requesting a book from the catalog shows a success toast", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1" } };
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/borrow-requests") && init?.method === "POST") return json({ data: { id: "r1", status: "PENDING" } }, 201);
      return json({ data: { items: [{ id: "b1", title: "Fictional Atlas", authors: "A. Writer", availability: { total: 2, available: 1 } }] } });
    });
    render(<MemoryRouter initialEntries={["/m/catalog"]}><ToastProvider><Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes></ToastProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^Fictional Atlas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Request to borrow" }));
    expect(await screen.findByText("Borrow request sent")).toBeInTheDocument();
  });

  it("page numbers and availability wording", () => {
    expect(pageList(1, 3)).toEqual([1, 2, 3]);
    expect(pageList(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
    expect(pageList(1, 6)).toEqual([1, 2, "…", 6]);
    expect(availabilityText({ total: 0, available: 0 }).text).toBe("Unavailable at the moment");
    expect(availabilityText({ total: 2, available: 0 }).text).toBe("All copies borrowed");
    expect(availabilityText({ total: 3, available: 1 }).ok).toBe(true);
  });

  it("catalog paginates, shows full details with N/A, and saves a star rating", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    const book = (n: number) => ({ id: `b${n}`, title: `Fictional Book ${n}`, authors: "A. Writer", publisher: "Sample Press", publishedYear: 1990, isbn: null, serialNumber: `FB-${n}`, description: "A short fictional description.", availability: { total: 1, available: 1 }, rating: { average: 0, count: 0 }, myRating: null, canRate: true, borrowCount: 3, viewCount: 7 });
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/rating")) return json({ data: { myRating: 4, rating: { average: 4, count: 1 } } });
      const offset = Number(new URL(url).searchParams.get("offset"));
      return json({ data: { items: Array.from({ length: 10 }, (_, i) => book(offset + i + 1)), total: 25 } });
    });
    render(<MemoryRouter initialEntries={["/m/catalog"]}><ToastProvider><Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes></ToastProvider></MemoryRouter>);
    await screen.findByText("Fictional Book 1");
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(await screen.findByText("Fictional Book 11")).toBeInTheDocument();
    expect(calls.some(c => c.includes("offset=10"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^Fictional Book 11/ }));
    const sheet = screen.getByRole("dialog");
    for (const t of ["Author", "Published", "ISBN", "Serial number", "Availability"]) expect(within(sheet).getByText(t)).toBeInTheDocument();
    expect(within(sheet).getByText("1990 · Sample Press")).toBeInTheDocument();
    expect(within(sheet).getByText("N/A")).toBeInTheDocument();
    expect(within(sheet).getByText("FB-11")).toBeInTheDocument();
    expect(within(sheet).getByText("A short fictional description.")).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("radio", { name: "4 stars" }));
    expect(await within(sheet).findByLabelText("Rated 4 out of 5 by 1 member")).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "4 stars" })).toHaveAttribute("aria-checked", "true");
    expect(calls.some(c => c.startsWith("PUT") && c.includes("/catalog/b11/rating"))).toBe(true);
  });

  it("cards show availability, rating and times borrowed (no serial); New tag only for recent books", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [
      { id: "n1", title: "Brand New Fiction", serialNumber: "BNF-001", createdAt: recent, availability: { total: 2, available: 2 }, rating: { average: 4.5, count: 2 }, borrowCount: 5 },
      { id: "o1", title: "Older Fiction", serialNumber: "OLD-001", createdAt: old, availability: { total: 0, available: 0 }, rating: { average: 0, count: 0 }, borrowCount: 0 },
    ], total: 2 } }));
    at("/m/catalog", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    const fresh = (await screen.findAllByRole("button", { name: /Brand New Fiction/ }))[0]!; // the card (its heart button comes after it)
    expect(within(fresh).getByText("New")).toBeInTheDocument();
    expect(within(fresh).getByLabelText("Rated 4.5 out of 5")).toBeInTheDocument();
    expect(within(fresh).getByLabelText("Borrowed 5 times")).toBeInTheDocument();
    expect(within(fresh).queryByText("BNF-001")).not.toBeInTheDocument();
    const older = screen.getByRole("button", { name: /^Older Fiction/ });
    expect(within(older).queryByText("New")).not.toBeInTheDocument();
    expect(within(older).getByText("Unavailable at the moment")).toBeInTheDocument();
  });

  it("members who haven't borrowed a book are told to borrow it before rating; a view counts after 12 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (String(input).includes("/view")) return json({ data: { counted: true, viewCount: 8 } });
      return json({ data: { items: [{ id: "v1", title: "Viewed Fiction", availability: { total: 1, available: 1 }, rating: { average: 0, count: 0 }, borrowCount: 1, viewCount: 7, canRate: false }], total: 1 } });
    });
    at("/m/catalog", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    fireEvent.click(await screen.findByRole("button", { name: /^Viewed Fiction/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Borrow this book first to rate it.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Viewed 7 times")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(VIEW_AFTER_MS - 1000); });
    expect(calls.some(c => c.includes("/view"))).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(calls.some(c => c.startsWith("POST") && c.includes("/catalog/v1/view"))).toBe(true);
    expect(await within(sheet).findByLabelText("Viewed 8 times")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("nav badges count only what arrived after the tab was last opened; bell rings for new librarian notices", () => {
    const t = (h: number) => new Date(Date.UTC(2026, 10, 20, h)).toISOString();
    const seen = { alerts: Date.parse(t(10)), loans: Date.parse(t(10)), catalog: Date.parse(t(10)), profile: Date.parse(t(10)) };
    const src = {
      notes: [
        { type: "DUE_SOON", createdAt: t(12), readAt: null },
        { type: "REQUEST_APPROVED", createdAt: t(11), readAt: null },
        { type: "OVERDUE", createdAt: t(9), readAt: null }, // before last visit
        { type: "RETURN_RECORDED", createdAt: t(12), readAt: t(13) }, // already read
      ],
      requests: [
        { status: "APPROVED", reviewedAt: t(11), transaction: { returnedAt: t(12) } },
        { status: "PENDING", reviewedAt: null },
        { status: "REJECTED", reviewedAt: t(8) },
      ],
      books: [{ createdAt: t(11) }, { createdAt: t(9) }],
    };
    const b = computeBadges(src, seen);
    expect(b.counts).toEqual({ alerts: 2, loans: 1, catalog: 1, profile: 1 });
    expect(b.ring).toBe(true);
    const opened = computeBadges(src, { ...seen, alerts: Date.parse(t(14)) });
    expect(opened.counts.alerts).toBe(0);
    expect(opened.ring).toBe(false);
  });

  it("swipe-to-delete has a keyboard / screen-reader delete button", async () => {
    const onDelete = vi.fn();
    render(<ul><li><SwipeToDelete label="Old update" onDelete={onDelete}><p>Old update</p></SwipeToDelete></li></ul>);
    fireEvent.click(screen.getByRole("button", { name: "Delete Old update" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it("receipt shows the book's ISBN and serial number instead of the copy barcode", () => {
    render(<Receipt data={{ id: "tx", receiptNo: "AK-20261120-ABC123", status: "ACTIVE", borrowedAt: new Date().toISOString(), dueAt: new Date(Date.now() + 86400000).toISOString(), bookCopy: { barcode: "COPY-01", book: { title: "Fictional Atlas", isbn: "9780000000001", serialNumber: "TNHS-0001", publisher: "Sample Press", publishedYear: 2020 } }, borrower: { username: "m1", displayName: "Juana Testcase", memberType: "STUDENT" } }} />);
    expect(screen.getByText("9780000000001")).toBeInTheDocument();
    expect(screen.getByText("TNHS-0001")).toBeInTheDocument();
    expect(screen.getByText("Sample Press · 2020")).toBeInTheDocument();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.queryByText("COPY-01")).not.toBeInTheDocument();
  });

  it("Profile: tiles, Account shows details then edits them, Statistics tab", async () => {
    const updateUser = vi.fn();
    authState.value = { ready: true, token: "t", updateUser, user: { id: "u1", username: "member1", role: "MEMBER" } };
    const past = new Date(Date.now() - 86400000).toISOString();
    const patches: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PATCH") { patches.push(String(init.body)); return json({ success: true, data: {} }); }
      if (url.includes("/auth/me")) return json({ success: true, data: { id: "u1", username: "member1", displayName: "Juana Testcase", memberType: "Student", gradeSection: "Grade 10 - Sampaguita", hobbies: null, role: "MEMBER", maskedId: "JT123456" } });
      if (url.includes("/circulation/transactions")) return json({ success: true, data: { items: [
        { id: "t1", status: "ACTIVE", dueAt: past, borrowedAt: past, bookCopy: { book: { title: "Overdue Atlas" } } },
        { id: "t2", status: "RETURNED", outcome: "RETURNED_LATE", returnedAt: past, borrowedAt: past, bookCopy: { book: { title: "Returned Atlas" } } },
      ] } });
      return json({ success: true, data: {} });
    });
    at("/m/profile", <ToastProvider><MobileProfile /></ToastProvider>);
    expect(await screen.findByText("Overdue Atlas")).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "Account summary" });
    for (const label of ["Borrowed now", "Returned", "Overdue"]) expect(within(stats).getByText(label).previousSibling).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/m/settings");

    fireEvent.click(screen.getByRole("tab", { name: /Account/ }));
    expect(screen.getByText("Grade 10 - Sampaguita")).toBeInTheDocument();
    expect(screen.getByText("JT123456")).toBeInTheDocument(); // Member ID from the Library ID card
    expect(screen.getAllByText("Not set")).toHaveLength(4); // gender, row no., phone and hobbies
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument(); // display only until Update
    fireEvent.click(screen.getByRole("button", { name: "Update information" }));
    fireEvent.change(screen.getByLabelText("Favourites & hobbies"), { target: { value: "Reading, chess" } });
    fireEvent.click(screen.getByRole("button", { name: "Female" }));
    fireEvent.change(screen.getByLabelText("Student Row No."), { target: { value: "23" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Information updated")).toBeInTheDocument();
    expect(JSON.parse(patches[0]!)).toMatchObject({ displayName: "Juana Testcase", hobbies: "Reading, chess", gradeSection: "10 - Sampaguita", memberType: "Student", gender: "Female", studentRowNo: 23 });
    expect(screen.getByText("Reading, chess")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Statistics/ }));
    expect(screen.getByRole("heading", { name: "Time in the app" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Time in the library" })).toBeInTheDocument();
    expect(screen.getByText("Late").parentElement).toHaveTextContent("1");
    expect(screen.getByText("0% on time")).toBeInTheDocument();
  });

  it("statistics helpers: months, returns, screen time, photo crop math", () => {
    const now = new Date("2026-11-20T10:00:00").getTime();
    const tx = (b: string, extra = {}) => ({ id: b, status: "RETURNED", borrowedAt: new Date(b).toISOString(), ...extra });
    const months = monthlyBorrows([tx("2026-11-02T09:00:00"), tx("2026-11-10T09:00:00"), tx("2026-09-01T09:00:00"), tx("2025-11-05T09:00:00")], now);
    expect(months.map(m => m.value)).toEqual([0, 0, 0, 1, 0, 2]);
    expect(returnBreakdown([tx("2026-11-01", { outcome: "DAMAGED" }), tx("2026-11-01"), { id: "x", status: "ACTIVE" }])).toEqual({ total: 2, onTime: 1, late: 0, torn: 1, missing: 0 });
    let u = addUsage({}, 5, 0, now - 40 * 86400000); // older than a month: dropped by later saves
    u = addUsage(u, 30, 1, now - 86400000);
    u = addUsage(u, 120, 1, now);
    u = addUsage(u, 60, 0, now);
    const week = lastDays(u, 7, now);
    expect(week.map(d => d.seconds)).toEqual([0, 0, 0, 0, 0, 30, 180]);
    expect(week[6]!.opens).toBe(1);
    expect(Object.keys(u)).toHaveLength(2);
    expect(fmtDuration(180)).toBe("3 min");
    expect(fmtDuration(3900)).toBe("1 h 5 min");
    // 500x1000 photo at scale 0.52 covers a 260 window: x pinned to [0,0], y within [260-520, 0].
    expect(clampOffset(50, -999, 500, 1000, 0.52, 260)).toEqual({ x: 0, y: -260 });
    expect(cropSource(-100, -50, 2, 260)).toEqual({ sx: 50, sy: 25, size: 130 });
  });

  it("Settings: theme switch turns on dark mode for the whole app and remembers it", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    at("/m/settings", <ToastProvider><Routes><Route path="/m/settings" element={<MobileSettings />} /></Routes></ToastProvider>);
    const sw = screen.getByRole("switch", { name: "Dark mode" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    // The knob moves at once; the page theme follows when the knob lands.
    expect(screen.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(document.documentElement.classList.contains("ak-dark")).toBe(true));
    expect(localStorage.getItem("aklatone_theme")).toBe("dark");
    expect(screen.getByRole("link", { name: /Change password/ })).toHaveAttribute("href", "/m/settings/password");
    expect(screen.getByRole("link", { name: /Privacy Policy/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /About AklatOne/ })).toHaveTextContent("Version test");
    fireEvent.click(sw);
    await waitFor(() => expect(document.documentElement.classList.contains("ak-dark")).toBe(false));
  });

  it("dark theme text colours meet WCAG AA on dark surfaces", () => {
    const block = css.slice(css.indexOf(":root.ak-dark {"), css.indexOf("}", css.indexOf(":root.ak-dark {")));
    const v = (name: string) => new RegExp(`--color-${name}: (#[0-9A-Fa-f]{6})`).exec(block)![1]!;
    const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
    for (const bg of [v("surface"), v("page"), v("primary-soft")]) {
      expect(ratio(v("ink"), bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v("ink-muted"), bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(v("line-strong"), v("surface"))).toBeGreaterThanOrEqual(3);
    expect(ratio(v("chart"), v("surface"))).toBeGreaterThanOrEqual(3);
  });

  it("Favourites: heart a book, make a folder, file the book, delete the folder", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input), method = init?.method ?? "GET";
      calls.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, "")} ${init?.body ?? ""}`.trim());
      if (url.includes("/favourites/mine")) return json({ data: { folders: [], items: [
        { id: "f1", folderId: null, createdAt: new Date().toISOString(), book: { id: "b1", title: "Hearted Atlas", categories: [{ id: "c2", name: "Horror", kind: "GENRE" }, { id: "c1", name: "English", kind: "SUBJECT" }] } },
      ] } });
      if (url.endsWith("/favourites/folders") && method === "POST") return json({ data: { id: "fold1", name: "To read" } }, 201);
      if (url.includes("/borrow-requests/mine")) return json({ data: { policy: { loanDays: 7, maxBooks: 8 }, items: [] } });
      return json({ data: {} });
    });
    at("/m/loans", <ToastProvider><MobileLoans /></ToastProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: /Favourites/ }));
    expect(await screen.findByText("Hearted Atlas")).toBeInTheDocument();
    // Categories read "Subject - English", "Genre - Horror", Subject first.
    expect(within(screen.getByRole("list", { name: "Categories" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Subject - English", "Genre - Horror"]);
    fireEvent.click(screen.getByRole("button", { name: /New folder/ }));
    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "To read" } });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    expect(await screen.findByText("Folder created")).toBeInTheDocument();
    // The new folder is open and empty; go back to All and file the book.
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to folder" }));
    fireEvent.click(await screen.findByRole("button", { name: "To read" }));
    expect(await screen.findByText('Added to "To read"')).toBeInTheDocument();
    expect(calls).toContain('PATCH /api/v1/favourites/b1 {"folderId":"fold1"}');
    fireEvent.click(within(screen.getByRole("group", { name: "Favourite folders" })).getByRole("button", { name: /^To read/ }));
    expect(screen.getByRole("heading", { name: "Hearted Atlas" })).toBeInTheDocument(); // the toast also names the book
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(await screen.findByText("Folder deleted")).toBeInTheDocument();
    expect(calls).toContain("DELETE /api/v1/favourites/folders/fold1");
    // Unhearting removes it from the list.
    fireEvent.click(screen.getByRole("button", { name: "Remove Hearted Atlas from favourites" }));
    expect(await screen.findByText("Removed from Favourites")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Hearted Atlas" })).not.toBeInTheDocument());
  });

  it("alert times and day grouping", () => {
    const now = new Date("2026-11-20T15:00:00").getTime();
    expect(timeAgo(new Date(now - 5 * 60000).toISOString(), now)).toBe("5 min ago");
    expect(timeAgo(new Date("2026-11-20T12:00:00").toISOString(), now)).toBe("3 h ago");
    expect(timeAgo(new Date("2026-11-19T20:00:00").toISOString(), now)).toBe("Yesterday");
    const groups = groupByDay([{ createdAt: new Date("2026-11-20T09:00:00").toISOString() }, { createdAt: new Date("2026-11-19T09:00:00").toISOString() }, { createdAt: new Date("2026-11-01T09:00:00").toISOString() }], now);
    expect(groups.map(g => g.label)).toEqual(["Today", "Yesterday", "Earlier"]);
  });

  it("Alerts separates librarian notices from request updates; opening one marks it read", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    const calls: string[] = [];
    const recent = new Date().toISOString();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return json({ data: { unread: 2, items: [
        { id: "n1", type: "DUE_SOON", title: "Return reminder", message: "Reminder: due Friday", transactionId: "t1", readAt: null, createdAt: recent },
        { id: "n2", type: "OVERDUE", title: "Overdue book", message: "Please return it", transactionId: null, readAt: null, createdAt: recent },
        { id: "n3", type: "REQUEST_APPROVED", title: "Borrow request approved", message: "Approved", transactionId: "t2", readAt: recent, createdAt: recent },
      ] } });
    });
    at("/m/notifications", <ToastProvider><Routes><Route path="/m/notifications" element={<MobileNotifications />} /><Route path="/m/receipt/:id" element={<p>Receipt page</p>} /></Routes></ToastProvider>);
    expect(await screen.findByText("2 unread alerts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Notices/ }));
    expect(screen.getByText("Return reminder")).toBeInTheDocument();
    expect(screen.getByText("Overdue book")).toBeInTheDocument();
    expect(screen.queryByText("Borrow request approved")).not.toBeInTheDocument();
    expect(screen.getAllByText("From the librarian")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: /Updates/ }));
    expect(screen.getByText("Borrow request approved")).toBeInTheDocument();
    expect(screen.queryByText("Return reminder")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /All/ }));
    fireEvent.click(screen.getByRole("button", { name: /Return reminder/ }));
    expect(await screen.findByText("Receipt page")).toBeInTheDocument();
    expect(calls.some(c => c === "POST http://localhost:3000/api/v1/notifications/n1/read" || (c.startsWith("POST") && c.includes("/notifications/n1/read")))).toBe(true);
  });

  it("due countdown wording", () => {
    const now = new Date("2026-11-20T10:00:00").getTime();
    expect(dueChip(new Date("2026-11-25T10:00:00").toISOString(), now).text).toBe("Due in 5 days");
    expect(dueChip(new Date("2026-11-21T09:00:00").toISOString(), now).text).toBe("Due tomorrow");
    expect(dueChip(new Date("2026-11-20T18:00:00").toISOString(), now).text).toBe("Due today");
    expect(dueChip(new Date("2026-11-18T10:00:00").toISOString(), now).text).toBe("Overdue by 2 days");
  });

  it("My Books opens on Borrowed and switches tabs", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    const due = new Date(Date.now() + 5 * 86400000).toISOString();
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("/favourites/mine")
      ? json({ data: { items: [], folders: [] } })
      : json({ data: { policy: { loanDays: 7, maxBooks: 8 }, items: [
        { id: "r1", status: "APPROVED", createdAt: due, book: { id: "b1", title: "Borrowed Fiction" }, transaction: { id: "t1", status: "ACTIVE", dueAt: due } },
        { id: "r2", status: "PENDING", createdAt: due, book: { id: "b2", title: "Pending Fiction" } },
      ] } }));
    at("/m/loans", <ToastProvider><MobileLoans /></ToastProvider>);
    expect(await screen.findByRole("heading", { name: "My Books" })).toBeInTheDocument();
    expect(screen.getByText("6 more books available to you")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Borrowed/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Borrowed Fiction")).toBeInTheDocument();
    expect(screen.getByText(/Due in \d days/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Requests/ }));
    expect(screen.getByText("Pending Fiction")).toBeInTheDocument();
    expect(screen.getByText("Waiting for librarian")).toBeInTheDocument();
    expect(screen.queryByText("Borrowed Fiction")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel").className).toContain("ak-from-right");
    expect(screen.getByRole("tab", { name: /History/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Past/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Borrowed/ }));
    expect(screen.getByRole("tabpanel").className).toContain("ak-from-left");
    expect(screen.getByText(/Borrow each book for 7 days/)).toBeInTheDocument();
    expect(screen.queryByText(/loan/i)).not.toBeInTheDocument();
  });

  it("pull-to-refresh is ignored while a book sheet is open", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [], total: 0, unread: 0 } }));
    let mounts = 0;
    const Probe = () => { useEffect(() => { mounts++; }, []); return <dialog open>sheet</dialog>; };
    at("/m/x", <Routes><Route element={<MobileLayout />}><Route path="/m/x" element={<Probe />} /></Route></Routes>);
    await screen.findByText("sheet");
    const touch = (type: string, y: number) => window.dispatchEvent(Object.assign(new Event(type), { touches: [{ clientY: y }] }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    await act(async () => { touch("touchstart", 100); touch("touchmove", 400); touch("touchend", 400); });
    expect(mounts).toBe(1);
  });

  it("back-to-top is hidden (not focusable) until the member scrolls", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [], total: 0 } }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    at("/m/catalog", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    const btn = screen.getByLabelText("Back to top");
    expect(btn).toHaveAttribute("tabindex", "-1");
    expect(btn.className).toContain("opacity-0");
  });

  it("pulling down at the top refreshes the screen; a short pull does not", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [], total: 0, unread: 0 } }));
    let mounts = 0;
    const Probe = () => { useEffect(() => { mounts++; }, []); return <p>screen</p>; };
    at("/m/x", <Routes><Route element={<MobileLayout />}><Route path="/m/x" element={<Probe />} /></Route></Routes>);
    await screen.findByText("screen");
    const touch = (type: string, y: number) => window.dispatchEvent(Object.assign(new Event(type), { touches: [{ clientY: y }] }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    await act(async () => { touch("touchstart", 100); touch("touchmove", 140); touch("touchend", 140); });
    expect(mounts).toBe(1);
    await act(async () => { touch("touchstart", 100); touch("touchmove", 400); touch("touchend", 400); });
    await waitFor(() => expect(mounts).toBe(2));
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes("/notifications/mine")).length).toBeGreaterThanOrEqual(2);
  });

  it("back-to-top appears after scrolling the catalog", async () => {
    authState.value = { ready: true, token: "t", user: { id: "u1", username: "member1", role: "MEMBER" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { items: [], total: 0 } }));
    window.scrollTo = vi.fn() as never;
    at("/m/catalog", <Routes><Route path="/m/catalog" element={<MobileCatalog />} /></Routes>);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument(); // aria-hidden while not shown
    Object.defineProperty(window, "scrollY", { value: 900, configurable: true });
    fireEvent.scroll(window);
    fireEvent.click(await screen.findByRole("button", { name: "Back to top" }));
    expect(window.scrollTo).toHaveBeenCalled();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("the current tab's icon is the raised one", () => {
    at("/m/catalog", <Routes><Route element={<MobileLayout />}><Route path="/m/catalog" element={<p>x</p>} /></Route></Routes>);
    const raised = (name: string) => screen.getByRole("link", { name }).querySelector("span")!.className.includes("-translate-y-4");
    expect(raised("Catalog")).toBe(true);
    expect(raised("Home")).toBe(false);
  });

  it("bottom navigation is a labelled nav that marks the current page", () => {
    at("/m/loans", <Routes><Route element={<MobileLayout />}><Route path="/m/loans" element={<p>x</p>} /></Route></Routes>);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Books" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Alerts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});
