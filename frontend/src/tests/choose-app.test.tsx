import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../features/auth/auth", () => ({ useAuth: () => ({ token: "t", user: { displayName: "Maria Santos", username: "lib" }, hasPerm: () => true, replaceToken: vi.fn(), updateUser: vi.fn() }) }));
import { ToastProvider } from "../components/Toast";
import { ChooseApp } from "../features/visits/ChooseApp";

describe("Desktop: choose the app after signing in", () => {
  afterEach(() => cleanup());

  it("offers the Visitor's Log and the LMS, and opens the LMS", () => {
    render(<MemoryRouter initialEntries={["/choose"]}><ToastProvider><Routes><Route path="/choose" element={<ChooseApp />} /><Route path="/" element={<p>Dashboard page</p>} /></Routes></ToastProvider></MemoryRouter>);
    expect(screen.getByText("Good day, Maria!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visitor's Log/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AklatOne LMS/ }));
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});
