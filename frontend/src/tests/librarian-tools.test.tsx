import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const authState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../features/auth/auth", () => ({ useAuth: () => authState.value }));

import { guessBookInfo } from "../features/mobile/MobileAddBook";
import { AddEmailForm } from "../components/mobile/AddEmailForm";
import { LibrarianSetup } from "../features/auth/LibrarianSetup";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(cleanup);
beforeEach(() => { vi.restoreAllMocks(); authState.value = { verifyEmail: vi.fn(async () => true), lastAuthError: () => null }; });

describe("Capture book info", () => {
  const line = (text: string, height = 20, top = 0) => ({ text, height, top });
  it("finds title (biggest text), author, publisher, year and ISBN in the text of a photo", () => {
    const g = guessBookInfo([
      line("NOLI ME TANGERE", 60, 100), line("Isang Nobela", 30, 180), line("by José Rizal", 22, 260),
      line("Published by Adarna House, Inc.", 14, 900), line("Copyright © 2015", 14, 920), line("ISBN 978-971-508-345-2", 14, 940),
    ]);
    expect(g).toEqual({ title: "NOLI ME TANGERE", authors: "José Rizal", publisher: "Adarna House, Inc.", publishedYear: "2015", isbn: "9789715083452" });
  });
  it("leaves a field empty when it is not on the photo", () => {
    expect(guessBookInfo([line("Science 7", 40)])).toEqual({ title: "Science 7", authors: "", publisher: "", publishedYear: "", isbn: "" });
  });
});

describe("Add your email (accounts made before email was required)", () => {
  it("sends a code to the typed email, then confirms it to sign in", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ success: true, data: { email: "j***@example.com" } }));
    const done = vi.fn();
    render(<AddEmailForm emailToken="tok" onDone={done} onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText("Your email"), { target: { value: "juan@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    expect(await screen.findByText("j***@example.com")).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ emailToken: "tok", email: "juan@example.com" });
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm email/ }));
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(authState.value.verifyEmail).toHaveBeenCalledWith("tok", "juan@example.com", "123456");
  });
});

describe("Emergency librarian recovery", () => {
  it("asks for the recovery key, then shows the new key and waits until it is saved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ success: true, data: { username: "new@example.com", recoveryKey: "AKLT-ABCDE-FGHJK-MNPQR-STUVW-XYZ23" } }, 201));
    render(<MemoryRouter><LibrarianSetup recover /></MemoryRouter>);
    expect(screen.getByText("Replace the librarian account", { selector: "h1" })).toBeInTheDocument();
    const type = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
    type("Recovery key", "AKLT-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA"); type("Name", "Maria Santos"); type("Position", "Librarian"); type("Department", "Library");
    type("Email", "new@example.com"); type("Password", "Strong#Pass2026"); type("Confirm password", "Strong#Pass2026");
    fireEvent.click(screen.getByRole("button", { name: /Replace the librarian account/ }));
    expect(await screen.findAllByText("AKLT-ABCDE-FGHJK-MNPQR-STUVW-XYZ23")).toHaveLength(1);
    // Print preview shows the paper first; Print sends only that paper.
    fireEvent.click(screen.getByRole("button", { name: "Print preview" }));
    expect(document.querySelector(".ak-paper")).toHaveTextContent("AKLT-ABCDE-FGHJK-MNPQR-STUVW-XYZ23");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/v1/setup/recover");
    const go = screen.getByRole("button", { name: "Go to Sign In" });
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(go).toBeEnabled();
  });
});
