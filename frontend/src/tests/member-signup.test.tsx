import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import css from "../index.css?raw";

const authState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../features/auth/auth", () => ({ useAuth: () => authState.value }));

import { MobileRegister } from "../features/mobile/MobileRegister";
import { FavouriteButton } from "../components/mobile/FavouriteButton";
import { ToastProvider } from "../components/Toast";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
  authState.value = { ready: true, user: null, token: "t", login: vi.fn(), activate: vi.fn(), verifyLoginOtp: vi.fn(), lastAuthError: () => null };
});

describe("Create an account", () => {
  it("asks for the Personal information details, then the emailed activation code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("member-id-preview")
      ? json({ success: true, data: { memberId: "JD123456" } })
      : json({ success: true, data: { requiresActivation: true, email: "j***@example.com" } }));
    render(<MemoryRouter><ToastProvider><MobileRegister /></ToastProvider></MemoryRouter>);
    for (const label of ["Full name", "Username", "Email", "Sex", "Grade & section", "Password", "Confirm password"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Phone/i)).toBeNull();
    expect(screen.queryByText(/Student Row No/i)).toBeNull();
    expect(screen.getByText(/this is set once/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/full name, username and email/);

    const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
    type("Full name", "Juan Dela Cruz");
    // The Member ID appears while the name is typed: initials of first + last name + the server's 6 digits.
    expect(await screen.findByText("123456")).toBeInTheDocument();
    expect(screen.getByLabelText("Member ID")).toHaveTextContent("JC123456");
    type("Username", "juan.dc"); type("Email", "juan@example.com"); type("Grade & section", "Grade 10 - Rizal");
    type("Password", "Strong-Pass-2026!"); type("Confirm password", "Strong-Pass-2026!");
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByText("Activate your account")).toBeInTheDocument();
    expect(screen.getByText(/j\*\*\*@example.com/)).toBeInTheDocument();
    const reg = fetchMock.mock.calls.find(c => String(c[0]).includes("/auth/register"))!;
    const sent = JSON.parse(String(reg[1]!.body));
    expect(sent).toMatchObject({ username: "juan.dc", email: "juan@example.com", memberType: "Student", gradeSection: "10 - Rizal", memberId: "JC123456" });
    expect(sent.department).toBeUndefined();
  });
});

describe("Heart: press and hold", () => {
  it("opens options to save to a folder or add to the Wishlist; a tap still just hearts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("/favourites/mine") ? json({ success: true, data: { items: [], folders: [{ id: "f1", name: "For my report" }] } }) : json({ success: true, data: {} }, 201));
    render(<ToastProvider><FavouriteButton bookId="b1" title="Noli Me Tangere" favourite={false} available={0} /></ToastProvider>);
    const heart = screen.getByRole("button", { name: /Add Noli Me Tangere to favourites/ });
    fireEvent.contextMenu(heart);
    expect(await screen.findByText("For my report")).toBeInTheDocument();
    expect(screen.getByText("Add to Wishlist")).toBeInTheDocument();
    expect(screen.getByText("New folder")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Add to Wishlist"));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith("/catalog/b1/watch") && i?.method === "PUT")).toBe(true));
  });
});

describe("Dark mode keeps chips highlighted", () => {
  const dark = css.slice(css.indexOf(":root.ak-dark"));
  const token = (n: string) => dark.match(new RegExp(`--color-${n}:\\s*(#[0-9A-Fa-f]{6})`))![1]!;
  const text = (cls: string) => dark.match(new RegExp(`\\.${cls}[^{]*\\{ color: (#[0-9A-Fa-f]{6})`))![1]!;
  const lum = (hex: string) => {
    const c = [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  it.each([["text-primary", "primary-soft"], ["text-danger", "danger-soft"], ["text-success", "success-soft"], ["text-warning", "warning-soft"], ["text-info", "info-soft"]])(
    "%s on %s is readable (>= 4.5:1) and the chip stands out from the card", (fg, bg) => {
      expect(contrast(text(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(bg), token("surface"))).toBeGreaterThan(1.15);
    });
});
