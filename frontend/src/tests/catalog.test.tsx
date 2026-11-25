import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider } from "../components/Toast";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

vi.mock("../features/auth/auth", () => ({
  useAuth: () => ({ user: { id: "1", username: "admin", role: "ADMIN", permissions: ["*"] }, token: "t", hasPerm: () => true, login: vi.fn(), logout: vi.fn(), expired: false }),
}));

import { Catalog } from "../features/catalog/Catalog";

describe("catalog", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { items: [{ id: "1", title: "Book A", authors: "Author", publisher: "Sample Press", publishedYear: 1999, serialNumber: "BKA-001", isbn: null, availability: { total: 2, available: 1 }, rating: { average: 4.5, count: 2 } }], total: 1, limit: 20, offset: 0 } }), { status: 200 }));
  });

  it("renders catalog records", async () => {
    const qc = new QueryClient();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    render(<QueryClientProvider client={qc}><BrowserRouter><ToastProvider><Catalog /></ToastProvider></BrowserRouter></QueryClientProvider>);
    expect(await screen.findByText("Book A")).toBeInTheDocument();
    expect(screen.getByText("BKA-001")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
    expect(screen.getByText("1999 · Sample Press")).toBeInTheDocument();
    expect(screen.getByLabelText("Rated 4.5 out of 5 by 2 members")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add book" }));
    for (const l of ["Title *", "Author", "Publisher", "Published year", "ISBN", "Serial number", "Copies", "Short description"]) expect(screen.getByLabelText(l)).toBeInTheDocument();
  });
});