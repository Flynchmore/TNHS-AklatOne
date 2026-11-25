import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ListState } from "../components/mobile/ui";

describe("loading skeletons", () => {
  afterEach(() => cleanup());

  it("shows placeholder cards (with a label for screen readers) instead of a spinner while a list loads", () => {
    const { container } = render(<ListState loading="Loading books…"><p>Books</p></ListState>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading books…");
    expect(container.querySelectorAll("[aria-hidden='true'].rounded-3xl")).toHaveLength(4);
    expect(screen.queryByText("Books")).not.toBeInTheDocument();
  });

  it("uses side-by-side cards for horizontal rows, and shows the content once loaded", () => {
    const { container, rerender } = render(<ListState loading="Loading books…" skeleton="row"><p>Books</p></ListState>);
    expect(container.querySelector("[role='status']")).toHaveClass("flex");
    rerender(<ListState loading={false}><p>Books</p></ListState>);
    expect(screen.getByText("Books")).toBeInTheDocument();
  });
});
