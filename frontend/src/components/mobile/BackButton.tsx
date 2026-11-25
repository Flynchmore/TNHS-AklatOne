import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/** Screens where Back leaves the app (it is minimized, so the session and the screen stay as they were). */
export const ROOT_SCREENS = ["/m", "/m/login", "/m/welcome", "/m/staff"];

/**
 * Android Back button and the edge-swipe back gesture: go to the previous screen inside AklatOne instead of closing
 * the app. On a main screen, the app is minimized.
 */
export function BackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  useEffect(() => { path.current = pathname; }, [pathname]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (ROOT_SCREENS.includes(path.current)) { void App.minimizeApp(); return; }
      if (canGoBack) nav(-1);
      else nav("/m", { replace: true }); // opened straight on an inner screen: Back leads Home first
    });
    return () => { void listener.then((l) => l.remove()); };
  }, [nav]);
  return null;
}
