import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { IdleLogout, IDLE_MS } from "../components/staff/IdleLogout";

describe("Staff Web / Desktop idle sign-out", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

  it("warns a minute before 30 idle minutes, and signs out at 30", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<IdleLogout onTimeout={onTimeout} />);
    act(() => { vi.advanceTimersByTime(IDLE_MS - 55_000); });
    expect(screen.getByText("Still there?")).toBeInTheDocument();
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("activity resets the timer", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    render(<IdleLogout onTimeout={onTimeout} />);
    act(() => { vi.advanceTimersByTime(20 * 60_000); });
    act(() => { window.dispatchEvent(new Event("keydown")); });
    act(() => { vi.advanceTimersByTime(20 * 60_000); });
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(11 * 60_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("Desktop offline: waits instead of signing out, and counts again from when the connection is back", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { rerender } = render(<IdleLogout onTimeout={onTimeout} paused />);
    act(() => { vi.advanceTimersByTime(2 * IDLE_MS); });
    expect(onTimeout).not.toHaveBeenCalled();
    rerender(<IdleLogout onTimeout={onTimeout} paused={false} />);
    act(() => { vi.advanceTimersByTime(IDLE_MS - 2 * 60_000); });
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
