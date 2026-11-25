import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./index.css";
import App, { detectNative } from "./App.tsx"
import { isDesktop } from "./lib/offline"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Staff Web shell (frontend/web-pwa): installable app + fast start. Not used inside the Desktop (Tauri) or Mobile (Capacitor) apps.
if (import.meta.env.PROD && "serviceWorker" in navigator && !isDesktop && !detectNative()) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* the portal works without it */ }); });
}
