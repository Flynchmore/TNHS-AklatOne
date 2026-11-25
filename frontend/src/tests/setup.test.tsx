import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../features/auth/auth";
import { Login } from "../features/auth/Login";
import { LibrarianSetup } from "../features/auth/LibrarianSetup";
import { Protected } from "../components/Protected";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** Answers by URL so each request gets its own fresh Response. */
function mockApi(routes: Record<string, () => Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const key = Object.keys(routes).find(k => url.includes(k));
    return key ? routes[key]() : json({ success: false }, 404);
  });
}
const app = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<LibrarianSetup />} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>,
);
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("first-run librarian setup", () => {
  it("login sends staff to setup when no librarian exists", async () => {
    mockApi({ "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: true } }) });
    app("/login");
    expect(await screen.findByRole("heading", { name: "Set up the librarian account" })).toBeInTheDocument();
    for (const l of ["Name", "Position", "Department", "Email", "Password", "Confirm password"]) expect(screen.getByLabelText(l)).toBeInTheDocument();
  });

  it("blocks a weak password without calling the server", async () => {
    const f = mockApi({ "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: true } }) });
    app("/setup");
    await screen.findByRole("heading", { name: "Set up the librarian account" });
    fill("Name", "Maria Santos"); fill("Position", "School Librarian"); fill("Department", "Library"); fill("Email", "lib@example.test");
    fill("Password", "password1"); fill("Confirm password", "password1");
    fireEvent.click(screen.getByRole("button", { name: "Create librarian account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/stronger password/i);
    expect(f.mock.calls.some(c => String(c[0]).includes("/setup/librarian"))).toBe(false);
  });

  it("creates the account and points to sign-in with the email", async () => {
    const f = mockApi({
      "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: true } }),
      "/setup/librarian": () => json({ success: true, data: { username: "lib@example.test" } }, 201),
    });
    app("/setup");
    await screen.findByRole("heading", { name: "Set up the librarian account" });
    fill("Name", "Maria Santos"); fill("Position", "School Librarian"); fill("Department", "Library"); fill("Email", "lib@example.test");
    fill("Password", "Strong#Pass2026"); fill("Confirm password", "Strong#Pass2026");
    fireEvent.click(screen.getByRole("button", { name: "Create librarian account" }));
    expect(await screen.findByRole("heading", { name: "Librarian account created" })).toBeInTheDocument();
    const body = JSON.parse(String((f.mock.calls.find(c => String(c[0]).includes("/setup/librarian"))![1] as RequestInit).body));
    expect(body).toEqual({ name: "Maria Santos", position: "School Librarian", department: "Library", email: "lib@example.test", password: "Strong#Pass2026" });
  });

  it("setup page sends you to sign-in once a librarian exists", async () => {
    mockApi({ "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: false } }) });
    app("/setup");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("staff login asks for the emailed code instead of failing", async () => {
    mockApi({
      "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: false } }),
      "/auth/login": () => json({ success: true, data: { requiresOtp: true, email: "lib@example.test" } }),
    });
    app("/login");
    fill("Username", "lib@example.test"); fill("Password", "Strong#Pass2026");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.getByText(/sent a 6-digit code to/)).toHaveTextContent("lib@example.test");
    expect(screen.getAllByRole("textbox", { name: /Digit \d of 6/ })).toHaveLength(6);
  });

  it("tells the user how many sign-in attempts are left", async () => {
    mockApi({
      "/setup/status": () => json({ success: true, data: { needsLibrarianSetup: false } }),
      "/auth/login": () => new Response(JSON.stringify({ success: false, message: "Invalid credentials" }), { status: 401, headers: { "RateLimit-Remaining": "3" } }),
    });
    app("/login");
    fill("Username", "lib@example.test"); fill("Password", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password. 3 attempts left before a 15-minute lock.");
  });

  it("a page refresh with a saved session stays signed in", async () => {
    localStorage.setItem("aklatone_token", "saved-token");
    mockApi({ "/auth/me": () => json({ success: true, data: { id: "u1", username: "lib@example.test", role: "LIBRARIAN", permissions: ["circulation:read"] } }) });
    render(
      <MemoryRouter initialEntries={["/requests"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Login page</p>} />
            <Route path="/requests" element={<Protected><p>Borrow Requests page</p></Protected>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Borrow Requests page")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
