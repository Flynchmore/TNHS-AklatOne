#!/usr/bin/env node
// Starts AklatOne for development in one terminal.
//   npm run dev           Redis + MariaDB check + API + Staff Web
//   npm run dev:desktop   Redis + MariaDB check + API + Staff Desktop (Tauri window)
//   npm run dev:all       Redis + MariaDB check + API + Staff Web + Staff Desktop
// The Member Mobile app is installed on a phone separately: npm run android
import { spawn, execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = process.argv[2] ?? "web";
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (s) => console.log(`${c("1;34", "[aklatone]")} ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const portOpen = (port) => new Promise((resolve) => {
  const s = createConnection({ host: "127.0.0.1", port });
  s.once("connect", () => { s.end(); resolve(true); });
  s.once("error", () => resolve(false));
  s.setTimeout(1500, () => { s.destroy(); resolve(false); });
});
const tryRun = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch { return false; } };

// 1. Database (MariaDB on 3307, user service from development-environment.md).
if (!(await portOpen(3307))) {
  say("MariaDB is not running; starting the aklatone-mariadb service…");
  tryRun("systemctl", ["--user", "start", "aklatone-mariadb"]);
  await sleep(2000);
}
say((await portOpen(3307)) ? `${c("32", "✔")} MariaDB is running (port 3307)` : `${c("31", "✖")} MariaDB is still not running. Start it: systemctl --user start aklatone-mariadb`);

// 2. Redis (Docker container). Optional: the API falls back to in-memory sign-in limits without it.
if (!(await portOpen(6379)) && tryRun("docker", ["start", "aklatone-redis"])) await sleep(1000);
say((await portOpen(6379)) ? `${c("32", "✔")} Redis is running (port 6379)` : `${c("33", "⚠")} Redis is not running (optional; create it once with: docker run -d --name aklatone-redis --restart unless-stopped -p 6379:6379 redis:7-alpine)`);

// 3. Child apps with coloured prefixes; Ctrl+C stops all of them.
const children = [];
function start(name, color, cwd, cmd, args) {
  const child = spawn(cmd, args, { cwd: `${root}${cwd}`, env: { ...process.env, FORCE_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  const tag = c(color, `[${name}]`.padEnd(10));
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) console.log(`${tag}${l}`);
    });
  }
  child.on("exit", (code) => { say(`${name} stopped${code ? ` (exit code ${code})` : ""}`); });
  children.push(child);
  return child;
}
const stopAll = () => { for (const ch of children) ch.kill("SIGTERM"); setTimeout(() => process.exit(0), 500); };
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

// Reuse an API that is already running (e.g. started in another terminal) instead of a second one on the same port.
const apiRunning = await fetch("http://localhost:3000/health").then((r) => r.ok, () => false);
if (apiRunning) say(`${c("32", "✔")} An AklatOne API is already running on port 3000; using it`);
else start("api", "35", "backend", "npm", ["run", "dev"]);
say("Waiting for the API to answer on http://localhost:3000/health …");
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { up = (await fetch("http://localhost:3000/health")).ok; } catch { /* not yet */ }
  if (!up) await sleep(1000);
}
say(up ? `${c("32", "✔")} API is ready` : `${c("33", "⚠")} API did not answer within 60 s; starting the apps anyway (check the [api] lines above)`);

if (target === "web" || target === "all") start("web", "36", "frontend", "npm", ["run", "dev"]);
if (target === "desktop") start("desktop", "33", "frontend", "npm", ["run", "dev:desktop"]);
// dev:all: the desktop window reuses the Staff Web dev server instead of starting a second one on the same port.
if (target === "all") { await sleep(3000); start("desktop", "33", "frontend", "npx", ["tauri", "dev", "--config", '{"build":{"beforeDevCommand":""}}']); }
say(c("2", "Press Ctrl+C to stop everything. Member Mobile (phone): npm run android"));
