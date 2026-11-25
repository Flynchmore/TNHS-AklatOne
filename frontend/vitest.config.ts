import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify("test"), __BUILD_DATE__: JSON.stringify("2026-01-01") },
  // css.include: let the mobile token-contrast test read src/index.css (Vitest returns "" for CSS by default).
  test: { environment: "jsdom", setupFiles: "./src/test/setup.ts", css: { include: [/index\.css/] } },
});