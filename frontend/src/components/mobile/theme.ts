import { useSyncExternalStore } from "react";
import { isDesktop } from "../../lib/offline";

export type Theme = "light" | "dark";
const KEY = "aklatone_theme";
const listeners = new Set<() => void>();

export function storedTheme(): Theme {
  try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

/** Applies the saved theme to <html> (Member Mobile and Staff Web each keep their own saved choice per device). */
export function applyTheme(enabled: boolean) {
  document.documentElement.classList.toggle("ak-dark", enabled && storedTheme() === "dark");
}

/**
 * Saves and applies a theme with one short GPU cross-fade (View Transitions) where supported, otherwise instantly.
 * No per-element colour transitions: animating every element's colours is what made the switch lag on phones.
 */
export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: theme lasts this session only */ }
  const swap = () => { document.documentElement.classList.toggle("ak-dark", theme === "dark"); listeners.forEach(l => l()); };
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  // The desktop WebView (WebKitGTK) delays view-transition callbacks, so the theme seemed not to change; switch instantly there.
  if (doc.startViewTransition && !reduce && !isDesktop) doc.startViewTransition(swap);
  else swap();
}

export function useTheme(): Theme {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, storedTheme, () => "light");
}
