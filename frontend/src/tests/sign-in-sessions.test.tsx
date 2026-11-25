import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const replaceToken = vi.fn();
vi.mock("../features/auth/auth", () => ({ useAuth: () => ({ token: "t", replaceToken }) }));
import { ToastProvider } from "../components/Toast";
import { SignInSessions } from "../components/SignInSessions";

const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify({ success: status < 400, data, message: status < 400 ? "OK" : "Wrong password." }), { status }));
const sessions = { items: [
  { id: "s1", device: "Chrome on Windows", network: "School / local network (192.168.1.5)", createdAt: "2026-11-25T01:00:00Z", lastSeenAt: "2026-11-25T02:00:00Z", current: true },
  { id: "s2", device: "AklatOne app on Android", network: "Internet (IP address 203.0.113.9)", createdAt: "2026-11-24T01:00:00Z", lastSeenAt: "2026-11-24T03:00:00Z", current: false },
] };

describe("Settings > Sign-in devices", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("lists devices and signs one out only with the password and the emailed code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/sessions")) return json(sessions);
      if (url.endsWith("/auth/sessions/code")) return json({ needsCode: true, email: "j***@example.com" });
      if (url.endsWith("/auth/sessions/revoke")) {
        const body = JSON.parse(String(init?.body));
        return body.password === "Right-Pass-1!" ? json({ signedOut: 1, current: false }) : json(null, 400);
      }
      return json({});
    });
    render(<ToastProvider><SignInSessions /></ToastProvider>);
    expect(await screen.findByText("AklatOne app on Android")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Sign out$/ })).toHaveLength(1); // not for this device

    fireEvent.click(screen.getByRole("button", { name: /^Sign out$/ }));
    expect(await screen.findByText(/6-digit code sent to j\*\*\*@example.com/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: "Right-Pass-1!" } });
    fireEvent.change(screen.getByLabelText(/6-digit code/), { target: { value: "123456" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Sign out/ }).at(-1)!);

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/revoke"))).toBe(true));
    const revoke = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/revoke"))!;
    expect(JSON.parse(String(revoke[1]!.body))).toEqual({ sessionId: "s2", password: "Right-Pass-1!", code: "123456" });
    expect((revoke[1]!.headers as Record<string, string>)["X-AklatOne-App"]).toBe("web");
  });
});
