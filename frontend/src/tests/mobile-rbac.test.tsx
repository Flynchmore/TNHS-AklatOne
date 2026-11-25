import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const auth = { ready: true, user: { role: "MEMBER" } as { role: string } | null };
vi.mock("../features/auth/auth", () => ({ useAuth: () => auth }));
import { MobileProtected } from "../components/mobile/MobileProtected";

const app = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/m" element={<MobileProtected><p>Member home</p></MobileProtected>} />
      <Route path="/m/staff" element={<MobileProtected staff><p>Librarian scanner</p></MobileProtected>} />
      <Route path="/m/login" element={<p>Sign in</p>} />
    </Routes>
  </MemoryRouter>,
);

describe("phone app RBAC", () => {
  afterEach(() => cleanup());
  it("members stay in the member app and cannot open librarian mode", () => {
    auth.user = { role: "MEMBER" };
    app("/m/staff");
    expect(screen.getByText("Member home")).toBeInTheDocument();
  });
  it("librarians are sent to librarian mode", () => {
    auth.user = { role: "LIBRARIAN" };
    app("/m");
    expect(screen.getByText("Librarian scanner")).toBeInTheDocument();
  });
  it("signed-out users go to sign in", () => {
    auth.user = null;
    app("/m/staff");
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});
