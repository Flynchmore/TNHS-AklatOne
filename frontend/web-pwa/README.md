# web-pwa: Staff Web shell

Installable Progressive Web App files for the Staff Web portal (librarian and admin):
`manifest.webmanifest`, `sw.js` (service worker) and `icons/`.

- The app code itself is the shared `frontend/src`; Vite serves these files in development and copies them into
  `dist/` on build (plugin in `frontend/vite.config.ts`).
- The service worker is registered only in the browser build (not in the Desktop or Mobile apps) and never caches
  `/api`, so library data is always live. Offline work is the Desktop app's job.

Sibling shells: `../desktop-tauri` (Staff Desktop) and `../mobile-capacitor` (Member Mobile: `android/` and `ios/`).
