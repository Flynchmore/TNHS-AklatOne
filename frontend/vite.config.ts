import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Android app's versionName is the single source of the version shown in Settings > About.
function readAppVersion() {
  try { return /versionName\s+"([^"]+)"/.exec(readFileSync(new URL("./mobile-capacitor/android/app/build.gradle", import.meta.url), "utf8"))?.[1] ?? "dev"; }
  catch { return process.env.APP_VERSION ?? "dev"; } // e.g. a Docker build without the Android project
}
const appVersion = readAppVersion();

/** Prints which AklatOne app this dev server is for: Staff Web (npm run dev) or Staff Desktop (npm run dev:desktop). */
function aklatoneBanner(mode: string, api: string): Plugin {
  return {
    name: "aklatone-banner",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const c = (code: string, s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
        const desktop = mode === "desktop";
        // After Vite's own "Local:" lines.
        setTimeout(() => console.log([
          "",
          c("1;34", desktop ? "  AklatOne · Staff Desktop app (Tauri)" : "  AklatOne · Staff Web portal (librarian and admin)"),
          desktop ? "  The desktop window opens by itself; this server feeds it with live reload." : "  Open the Local address above in a browser.",
          "  Pages: /login (sign in, Forgot password) · /setup (first librarian) · /recover (emergency recovery key)",
          `  API: ${api}  ${c("2", "(from the project root, npm run dev starts it for you)")}`,
          c("2", `  Other apps: ${desktop ? "Staff Web  npm run dev" : "Staff Desktop  npm run dev:desktop"}  ·  Phone app  npm run android (USB) / npm run android:share (Wi-Fi)`),
          "",
        ].join("\n")), 50);
      });
    },
  };
}

/** Staff Web PWA shell (frontend/web-pwa): served in dev, copied into dist/ on build. */
function webPwa(): Plugin {
  const dir = fileURLToPath(new URL("./web-pwa", import.meta.url));
  const files: Record<string, string> = {
    "manifest.webmanifest": "application/manifest+json", "sw.js": "text/javascript",
    "icons/icon-192.png": "image/png", "icons/icon-512.png": "image/png", "icons/maskable-512.png": "image/png",
  };
  return {
    name: "aklatone-web-pwa",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0]!.slice(1);
        if (!files[path]) return next();
        res.setHeader("Content-Type", files[path]!);
        res.end(readFileSync(join(dir, path)));
      });
    },
    generateBundle() {
      for (const fileName of Object.keys(files)) this.emitFile({ type: "asset", fileName, source: readFileSync(join(dir, fileName)) });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), tailwindcss(), webPwa(), aklatoneBanner(mode, env.VITE_API_BASE_URL ?? "http://localhost:3000")],
    define: { __APP_VERSION__: JSON.stringify(appVersion), __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  };
});
