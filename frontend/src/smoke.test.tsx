import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "./features/auth/auth";
import App from "./App";

describe("app", () => {
  it("renders login route", () => {
    window.history.pushState({}, "", "/login");
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuthProvider><App /></AuthProvider></QueryClientProvider>);
    expect(screen.getAllByText(/AklatOne/i).length).toBeGreaterThan(0);
  });
});