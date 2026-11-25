import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../features/auth/auth", () => ({ useAuth: () => ({ token: "kiosk", replaceToken: vi.fn(), updateUser: vi.fn() }) }));
vi.mock("qrcode", () => ({ default: { toString: async () => "<svg></svg>" } }));
import { Kiosk } from "../features/visits/Kiosk";

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, message: status >= 400 ? "No member has the Member ID ZZ000000." : "OK" }), { status });
const type = (code: string) => {
  const f = document.getElementById("kiosk-code") as HTMLInputElement;
  fireEvent.change(f, { target: { value: code } });
  fireEvent.keyDown(f, { key: "Enter" });
};
const show = () => render(<MemoryRouter><Kiosk /></MemoryRouter>);

describe("Visitor's Log kiosk screen", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

  it("records Time In for a Member ID and lists it without names", async () => {
    const at = new Date().toISOString();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("/visits/scan")) return json({ action: "in", visit: { timeIn: at, timeOut: null } });
      if (String(url).includes("/visits/today")) return json({ items: init?.method ? [] : [{ id: "v1", memberCode: "CA123456", timeIn: at, timeOut: null }] });
      return json({ code: "AKLATONE-VISIT:x" });
    });
    show();
    type("ca123456");
    expect(await screen.findByText("Time In · CA123456")).toBeInTheDocument();
    expect(await screen.findByText("Inside")).toBeInTheDocument();
  });

  it("explains a code that is not a Member ID, and a Member ID the server does not know", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => (String(url).includes("/visits/scan") ? json(null, 404) : json({ items: [] })));
    show();
    type("hello");
    expect(await screen.findByText("That is not a Member ID")).toBeInTheDocument();
    type("ZZ000000");
    expect(await screen.findByText(/No member has the Member ID ZZ000000/)).toBeInTheDocument();
  });

  it("without internet, keeps the scan on this computer and shows it as saved offline", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/visits/scan")) throw new TypeError("Failed to fetch");
      return json({ items: [] });
    });
    show();
    type("CA123456");
    expect(await screen.findByText(/Saved on this computer/)).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("aklatone_kiosk_queue")!)).toHaveLength(1));
    expect(screen.getByText("Saved offline")).toBeInTheDocument();
  });
});
