import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const auth = { ready: true, user: { role: "MEMBER", username: "juan", displayName: "Juan Dela Cruz", permissions: ["catalog:read"] } as Record<string, unknown> | null, logout: vi.fn() };
vi.mock("../features/auth/auth", () => ({ useAuth: () => auth }));
import { Protected } from "../components/Protected";

describe("staff portal guard", () => {
  afterEach(() => cleanup());
  it("shows members a notice instead of the staff portal", () => {
    render(<MemoryRouter><Protected><p>Staff dashboard</p></Protected></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("This portal is for the library staff");
    expect(screen.queryByText("Staff dashboard")).not.toBeInTheDocument();
    screen.getByRole("button", { name: /Sign out/ }).click();
    expect(auth.logout).toHaveBeenCalled();
  });
  it("lets the librarian in", () => {
    auth.user = { role: "LIBRARIAN", username: "lib", permissions: ["catalog:read"] };
    render(<MemoryRouter><Protected><p>Staff dashboard</p></Protected></MemoryRouter>);
    expect(screen.getByText("Staff dashboard")).toBeInTheDocument();
  });
});
