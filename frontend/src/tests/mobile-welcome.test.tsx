import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { MobileWelcome, hasConsented, CONSENT_VERSION } from "../features/mobile/MobileWelcome";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("member app first launch", () => {
  it("shows five swipeable slides, then Terms/Privacy consent that needs both boxes", () => {
    const done = vi.fn();
    render(<MemoryRouter><MobileWelcome onDone={done} /></MemoryRouter>);
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
    expect(screen.getAllByRole("tab", { name: /^Slide \d/ })).toHaveLength(5);

    // Swipe left to the next slide, then use Next for the rest.
    const carousel = screen.getByLabelText("Welcome to AklatOne");
    fireEvent.pointerDown(carousel, { clientX: 300 });
    fireEvent.pointerUp(carousel, { clientX: 100 });
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    for (let n = 0; n < 3; n++) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("5 / 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Get started/ }));

    expect(screen.getByRole("heading", { name: "Terms, privacy and security" })).toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept and continue" });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/agree to the Terms & Conditions/));
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/essential cookies and on-device storage/));
    fireEvent.click(accept);

    expect(done).toHaveBeenCalledOnce();
    expect(hasConsented()).toBe(true);
    expect(JSON.parse(localStorage.getItem("aklatone_consent")!)).toMatchObject({ version: CONSENT_VERSION, terms: true, storage: true });
  });

  it("Skip goes straight to the consent step (consent itself cannot be skipped)", () => {
    render(<MemoryRouter><MobileWelcome onDone={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
    expect(hasConsented()).toBe(false);
  });

  it("asks again when the terms version changes", () => {
    localStorage.setItem("aklatone_consent", JSON.stringify({ version: "2020-01-01" }));
    expect(hasConsented()).toBe(false);
  });
});
