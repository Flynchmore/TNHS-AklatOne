import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../features/auth/auth";
import { Login } from "../features/auth/Login";
import { Protected } from "../components/Protected";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}><BrowserRouter><AuthProvider>{ui}</AuthProvider></BrowserRouter></QueryClientProvider>);
}

afterEach(cleanup);

describe("auth and dashboard", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("renders login", () => {
    window.history.pushState({}, "", "/login");
    wrap(<Login />);
    expect(screen.getAllByText(/AklatOne/i).length).toBeGreaterThan(0);
  });

  it("invalid login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Invalid" }), { status: 401 }));
    wrap(<Login />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "y" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    await waitFor(() => expect(screen.getByText(/invalid username/i)).toBeInTheDocument());
  });

  it("protected route redirects unauthenticated", () => {
    window.history.pushState({}, "", "/dashboard");
    wrap(<Protected><div>Secret</div></Protected>);
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
});