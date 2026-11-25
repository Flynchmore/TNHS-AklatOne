import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../features/auth/auth";
import { Login } from "../features/auth/Login";
import { ToastProvider } from "../components/Toast";
import { RefreshButton } from "../features/circulation/RefreshButton";
import { Loans } from "../features/circulation/Loans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("staff portal feedback", () => {
  it("Refresh spins, reloads, and confirms with a toast", async () => {
    const onRefresh = vi.fn().mockResolvedValue({ isError: false, data: [1, 2] });
    render(<ToastProvider><RefreshButton what="borrow requests" onRefresh={onRefresh} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Refresh borrow requests" }));
    expect(screen.getByRole("button", { name: "Refresh borrow requests" })).toHaveTextContent("Refreshing…");
    expect(await screen.findByText("Borrow requests refreshed", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/2 item\(s\) shown/)).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("Refresh reports a failure", async () => {
    render(<ToastProvider><RefreshButton what="loans" onRefresh={() => Promise.resolve({ isError: true })} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Refresh loans" }));
    expect(await screen.findByText("Refresh failed", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("OTP step says Verify Code, keeps the spinner ~3 s, then shows a sign-in toast", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/setup/status")) return json({ success: true, data: { needsLibrarianSetup: false } });
      if (url.includes("/auth/login")) return json({ success: true, data: { requiresOtp: true, email: "lib@example.test" } });
      if (url.includes("/auth/verify-login-otp")) return json({ success: true, data: { user: { id: "u1", username: "lib@example.test", role: "LIBRARIAN", permissions: [] }, token: "a.eyJleHAiOjk5OTk5OTk5OTl9.c" } });
      return json({}, 404);
    });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider><ToastProvider>
          <Routes><Route path="/login" element={<Login />} /><Route path="/" element={<p>Dashboard</p>} /></Routes>
        </ToastProvider></AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "lib@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong#Pass2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("group", { name: "6-digit code" });
    fireEvent.paste(screen.getByLabelText("Digit 1 of 6"), { clipboardData: { getData: () => "123456" } });
    const started = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "Verify Code" }));
    expect(await screen.findByText("Dashboard", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    expect(screen.getByText("Signed in successfully")).toBeInTheDocument();
  }, 10000);

  it("librarian sends an editable return reminder for a book that is not yet due", async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    localStorage.setItem("aklatone_token", "a.eyJleHAiOjk5OTk5OTk5OTl9.c");
    const due = new Date(Date.now() + 3 * 86400000).toISOString();
    const posts: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/auth/me")) return json({ success: true, data: { id: "l1", username: "librarian", role: "LIBRARIAN", permissions: ["circulation:read", "circulation:write"] } });
      if (init?.method === "POST") { posts.push({ url, body: String(init.body) }); return json({ success: true, data: { sent: true } }, 201); }
      if (url.includes("status=ACTIVE")) return json({ success: true, data: { items: [{ id: "tx1", status: "ACTIVE", borrowedAt: due, dueAt: due, bookCopy: { barcode: "B-1", book: { title: "Fictional Atlas" } }, borrower: { username: "m1", displayName: "Juana Testcase" } }] } });
      return json({ success: true, data: { items: [] } });
    });
    render(<QueryClientProvider client={new QueryClient()}><AuthProvider><ToastProvider><MemoryRouter><Loans /></MemoryRouter></ToastProvider></AuthProvider></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Send reminder" }));
    const box = screen.getByLabelText("Message to the member") as HTMLTextAreaElement;
    expect(box.value).toMatch(/^Reminder: "Fictional Atlas" is due on/);
    fireEvent.change(box, { target: { value: "Please return Fictional Atlas by Friday." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Reminder sent")).toBeInTheDocument();
    expect(posts[0]!.url).toContain("/notifications/reminder");
    expect(JSON.parse(posts[0]!.body)).toEqual({ transactionId: "tx1", message: "Please return Fictional Atlas by Friday." });
    expect(screen.queryByRole("button", { name: "Overdue notice" })).not.toBeInTheDocument();
  });
});
