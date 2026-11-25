import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../features/auth/auth", () => ({ useAuth: () => ({ token: "t", hasPerm: () => true }) }));
import { ToastProvider } from "../components/Toast";
import { LendDialog } from "../features/circulation/LendDialog";

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, message: status >= 400 ? "No" : "OK" }), { status });
const member = { id: "m1", maskedId: "CA123456", displayName: "Carla Aquino", memberType: "Student", gradeSection: "Grade 10 - Rizal", activeLoans: 1, isActive: true };
const show = (onLent = vi.fn()) => {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ToastProvider><LendDialog open onClose={() => {}} onLent={onLent} /></ToastProvider></MemoryRouter></QueryClientProvider>);
  return onLent;
};
const scan = (id: string, code: string) => {
  const field = document.getElementById(id) as HTMLInputElement;
  fireEvent.change(field, { target: { value: code } });
  fireEvent.keyDown(field, { key: "Enter" }); // what a USB scanner does after typing the code
};

describe("Lend a book (desk)", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("refuses something that is not a Member ID, then finds the member by their card", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ items: [member] }));
    show();
    scan("lend-member", "hello");
    expect(await screen.findByText(/is not a Member ID/)).toBeInTheDocument();
    scan("lend-member", "ca123456");
    expect(await screen.findByText("Carla Aquino")).toBeInTheDocument();
    expect(screen.getByText(/Grade 10 - Rizal · 1 book\(s\) borrowed now/)).toBeInTheDocument();
  });

  it("tells the librarian to add a book that is not in AklatOne yet", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => (String(url).includes("/users") ? json({ items: [member] }) : json({ items: [], total: 0 })));
    show();
    scan("lend-member", "CA123456");
    await screen.findByText("Carla Aquino");
    fireEvent.change(screen.getByLabelText(/No QR label\?/), { target: { value: "Ibong Adarna" } });
    expect(await screen.findByText(/"Ibong Adarna" is not in AklatOne yet/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add this book/, hidden: true })).toBeInTheDocument();
  });

  it("lends by Member ID + copy QR code and opens the receipt", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("/users")) return json({ items: [member] });
      if (init?.method === "POST") return json({ id: "tx1", receiptNo: "AK-20261124-ABC123", dueAt: "2026-12-01T00:00:00Z", bookCopy: { book: { title: "Noli" } } }, 201);
      return json({ items: [] });
    });
    const onLent = show();
    scan("lend-member", "CA123456");
    await screen.findByText("Carla Aquino");
    scan("lend-copy", "nmt-001-01");
    expect(await screen.findByText("NMT-001-01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lend book/, hidden: true }));
    await waitFor(() => expect(onLent).toHaveBeenCalledWith("tx1"));
    const post = f.mock.calls.find(c => c[1]?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ memberCode: "CA123456", copyCode: "NMT-001-01" });
  });
});
