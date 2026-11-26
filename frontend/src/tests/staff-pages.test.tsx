import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../components/Toast";

vi.mock("../features/auth/auth", () => ({
  useAuth: () => ({ user: { id: "l1", username: "librarian", displayName: "Lia Brarian", role: "LIBRARIAN", permissions: [] }, token: "t", hasPerm: () => true, logout: vi.fn() }),
}));

import { Layout } from "../components/Layout";
import { CopiesDialog, allowedTransitions } from "../features/catalog/CopiesDialog";
import { Members } from "../features/members/Members";

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data }), { status });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("staff portal pages", () => {
  it("side nav shows the ten sections in their categories, in order, plus Logout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ pendingRequests: 3 }));
    wrap(<Layout />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map(l => l.textContent?.replace(/\d+$/, ""))).toEqual(["Dashboard", "Catalog", "Borrowing", "Suggestions", "Members", "Visitor's Log", "Reports", "Printing", "School Newspaper", "Settings"]);
    expect(within(nav).getAllByRole("heading").map(h => h.textContent)).toEqual(["Overview", "Circulation", "Patrons", "Records", "System"]);
    expect(screen.queryByRole("button", { name: /Search AklatOne/ })).toBeNull(); // removed from above Overview; Ctrl+K still opens the search
    expect(await within(nav).findByLabelText("3 pending requests")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logout/ })).toBeInTheDocument();
    expect(screen.getByText("Tagumpay National", { exact: false })).toBeInTheDocument();
  });

  it("Catalog > Copies shows the ISBN and adds a copy with one click", async () => {
    const posts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "POST") { posts.push(String(init.body)); return json({ id: "c2" }, 201); }
      return json({ items: [{ id: "c1", barcode: "BK-001-1", status: "AVAILABLE" }], total: 1 });
    });
    wrap(<CopiesDialog book={{ id: "b1", title: "Fictional Atlas", isbn: "9789710000001", availability: { total: 1, available: 1 }, rating: { average: 0, count: 0 } }} onClose={() => {}} />);
    expect(await screen.findByText("Copy 1")).toBeInTheDocument();
    // Copies are shown by ISBN; the internal copy code is never asked for or shown.
    expect(screen.getAllByText("9789710000001").length).toBeGreaterThan(0);
    expect(screen.queryByText("BK-001-1")).not.toBeInTheDocument();
    expect(screen.queryByText(/barcode/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a copy" }));
    expect(await screen.findByText("Copy added")).toBeInTheDocument();
    expect(JSON.parse(posts[0]!)).toEqual({ bookId: "b1" });
  });

  it("copy status changes follow the server rules", () => {
    expect(allowedTransitions("AVAILABLE")).toEqual(["LOST", "DAMAGED", "RETIRED"]);
    expect(allowedTransitions("LOST")).toEqual(["AVAILABLE", "RETIRED"]);
    expect(allowedTransitions("RETIRED")).toEqual([]);
  });

  it("Members lists members by Member ID and section (never the name) and deactivates after confirming", async () => {
    const patches: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") { patches.push({ url: String(input), body: String(init.body) }); return json({}); }
      return json({ items: [{ id: "m1", username: "juana", displayName: "Juana Testcase", maskedId: "JT123456", memberType: "Student", gradeSection: "10 - Rizal", isActive: true, createdAt: new Date().toISOString(), activeLoans: 1 }], total: 1 });
    });
    wrap(<Members />);
    expect(await screen.findByText("JT123456")).toBeInTheDocument();
    expect(screen.getByText("10 - Rizal")).toBeInTheDocument();
    expect(screen.queryByText(/Juana Testcase/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate JT123456" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByText("Member deactivated")).toBeInTheDocument();
    expect(patches[0]!.url).toContain("/api/v1/users/m1/status");
    expect(JSON.parse(patches[0]!.body)).toEqual({ isActive: false });
  });
});

describe("staff search", () => {
  it("Ctrl+K opens one search for pages, books, members and borrowed books, with a filter per kind", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input);
      if (url.includes("/api/v1/catalog?q=")) return json({ items: [{ id: "b1", title: "Noli Me Tangere", authors: "Jose Rizal", isbn: "9789710000001" }], total: 1 });
      if (url.includes("/api/v1/users?q=")) return json({ items: [{ id: "m1", maskedId: "JC123456", memberType: "Student", gradeSection: "10 - Rizal", displayName: "Juan Dela Cruz" }], total: 1 });
      if (url.includes("/circulation/transactions")) return json({ items: [] });
      return json({});
    });
    wrap(<Layout />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByLabelText(/Search pages, books, members/), { target: { value: "rizal" } });
    expect(await screen.findByText("Noli Me Tangere")).toBeInTheDocument();
    expect(await screen.findByText("JC123456")).toBeInTheDocument();
    expect(screen.queryByText("Juan Dela Cruz")).toBeNull(); // members by Member ID only
    fireEvent.click(screen.getByRole("radio", { name: /Books/ }));
    expect(screen.queryByText("JC123456")).toBeNull();
    expect(screen.getByText("Noli Me Tangere")).toBeInTheDocument();
  });
});
