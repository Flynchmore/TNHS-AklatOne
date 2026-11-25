import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const cap = vi.hoisted(() => ({ handler: null as ((e: { canGoBack: boolean }) => void) | null, minimizeApp: vi.fn() }));
vi.mock("@capacitor/app", () => ({ App: { addListener: (_: string, h: (e: { canGoBack: boolean }) => void) => { cap.handler = h; return Promise.resolve({ remove: vi.fn() }); }, minimizeApp: cap.minimizeApp } }));
vi.mock("@capacitor/core", async (orig) => {
  const real = await orig<typeof import("@capacitor/core")>();
  return { ...real, Capacitor: { ...real.Capacitor, getPlatform: () => "android", isNativePlatform: () => true } };
});
import { BackButton } from "../components/mobile/BackButton";

const app = (entries: string[]) => render(
  <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
    <BackButton />
    <Routes>
      <Route path="/m" element={<p>Home</p>} />
      <Route path="/m/catalog" element={<p>Catalog</p>} />
      <Route path="/m/receipt/1" element={<p>Receipt</p>} />
    </Routes>
  </MemoryRouter>,
);

describe("Android Back button", () => {
  afterEach(() => { cleanup(); cap.minimizeApp.mockClear(); });

  it("goes to the previous screen instead of closing the app", () => {
    app(["/m", "/m/catalog"]);
    act(() => cap.handler!({ canGoBack: true }));
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(cap.minimizeApp).not.toHaveBeenCalled();
  });

  it("minimizes the app on Home, and leads Home from an inner screen opened directly", () => {
    app(["/m/receipt/1"]);
    act(() => cap.handler!({ canGoBack: false }));
    expect(screen.getByText("Home")).toBeInTheDocument();
    act(() => cap.handler!({ canGoBack: false }));
    expect(cap.minimizeApp).toHaveBeenCalledTimes(1);
  });
});
