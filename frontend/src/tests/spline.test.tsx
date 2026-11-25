import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SplineArea, spline } from "../components/SplineArea";
import { MemberAvatar } from "../features/members/Members";

afterEach(cleanup);

describe("spline area chart", () => {
  it("never dips below the baseline between a busy month and an empty one", () => {
    const base = 170;
    const d = spline([{ x: 0, y: 170 }, { x: 50, y: 20 }, { x: 100, y: 170 }, { x: 150, y: 170 }], base);
    const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m => Number(m[2]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(base);
  });

  it("describes every point for screen readers and shows the values", () => {
    render(<SplineArea title="Books lent per month" points={[{ label: "Oct", value: 3 }, { label: "Nov", value: 7, display: "7 books" }]} />);
    expect(screen.getByRole("img", { name: "Books lent per month: Oct 3, Nov 7 books" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("member photo", () => {
  it("shows the member's own photo, or their initial when there is none", () => {
    const { container, rerender } = render(<MemberAvatar m={{ username: "juana", displayName: "Juana Testcase", avatarUrl: "data:image/jpeg;base64,AAA" }} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    rerender(<MemberAvatar m={{ username: "juana", displayName: "Juana Testcase", avatarUrl: null }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });
});
