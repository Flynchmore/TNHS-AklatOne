#!/usr/bin/env node
// Load test: many members using the app at the same time (E2E database only: it signs in as e2e_admin).
//   API=http://localhost:3000 USERS=300 SECONDS=60 node scripts/load-test.mjs
// 1. Creates fictional members loadtest_001.. if missing (Members > Add, as the librarian would).
// 2. "Morning rush": every member signs in at the same moment.
// 3. Each member then browses for SECONDS: home, catalog pages, book details, my loans, alerts, favourites,
//    with 1-4 s of "reading time" between taps. Prints latency per action and any errors.
const API = process.env.API ?? "http://localhost:3000";
const USERS = Number(process.env.USERS ?? 300);
const SECONDS = Number(process.env.SECONDS ?? 60);
const PASSWORD = "Load-Test-Pass-2026!";
const name = (i) => `loadtest_${String(i).padStart(3, "0")}`;

const stats = new Map();
async function call(label, path, { token, method = "GET", body } = {}) {
  const t = performance.now();
  let status = 0;
  try {
    const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
    status = r.status;
    const json = await r.json().catch(() => null);
    return { status, data: json?.data };
  } catch {
    return { status: 0 };
  } finally {
    const s = stats.get(label) ?? { ms: [], errors: {} };
    s.ms.push(performance.now() - t);
    if (status === 0 || status >= 400) s.errors[status] = (s.errors[status] ?? 0) + 1;
    stats.set(label, s);
  }
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };
function report(title) {
  console.log(`\n${title}`);
  console.log("action".padEnd(18), "count".padStart(6), "p50 ms".padStart(8), "p95 ms".padStart(8), "p99 ms".padStart(8), "max ms".padStart(8), "  errors");
  for (const [label, s] of stats) {
    console.log(label.padEnd(18), String(s.ms.length).padStart(6), ...[50, 95, 99].map((p) => pct(s.ms, p).toFixed(0).padStart(8)), Math.max(...s.ms).toFixed(0).padStart(8), " ", JSON.stringify(s.errors));
  }
  stats.clear();
}

const admin = (await call("admin sign-in", "/api/v1/auth/login", { method: "POST", body: { username: "e2e_admin", password: "TestPass123!" } })).data?.token;
if (!admin) { console.error("e2e_admin could not sign in: run this only against the E2E database."); process.exit(1); }

// Setup (not measured as part of the rush).
const ids = Array.from({ length: USERS }, (_, i) => i + 1);
let created = 0;
await pool(ids, 8, async (i) => {
  const r = await call("setup", "/api/v1/users", { token: admin, method: "POST", body: { username: name(i), password: PASSWORD, displayName: `Load Test ${i}`, memberType: "Student", gradeSection: `Grade ${7 + (i % 6)} - Section ${1 + (i % 4)}` } });
  if (r.status === 201) created++;
});
stats.clear();
console.log(`Members ready: ${USERS} (${created} created now). Books in catalog: ${(await call("x", "/api/v1/catalog?limit=1", { token: admin })).data?.total}`);
stats.clear();

// Morning rush: everyone signs in at once.
const tokens = [];
const rushStart = performance.now();
await Promise.all(ids.map(async (i) => {
  const r = await call("sign-in", "/api/v1/auth/login", { method: "POST", body: { username: name(i), password: PASSWORD } });
  if (r.data?.token) tokens.push(r.data.token);
}));
const rushSeconds = (performance.now() - rushStart) / 1000;
report(`MORNING RUSH: ${USERS} sign-ins at the same moment, all done in ${rushSeconds.toFixed(1)} s (${tokens.length} succeeded)`);

// Browsing.
const books = (await call("x", "/api/v1/catalog?limit=100", { token: admin })).data?.items?.map((b) => b.id) ?? [];
stats.clear();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const end = Date.now() + SECONDS * 1000;
let requests = 0;
const t0 = performance.now();
await Promise.all(tokens.map(async (token) => {
  await sleep(Math.random() * 3000);
  while (Date.now() < end) {
    const action = pick(["me", "catalog", "catalog", "search", "book", "book", "loans", "alerts", "favourites"]);
    if (action === "me") await call("my profile", "/api/v1/auth/me", { token });
    if (action === "catalog") await call("catalog page", `/api/v1/catalog?limit=20&offset=${20 * Math.floor(Math.random() * 10)}`, { token });
    if (action === "search") await call("catalog search", `/api/v1/catalog?q=${pick(["the", "a", "book", "of", "and", "history"])}&limit=20`, { token });
    if (action === "book" && books.length) await call("book details", `/api/v1/catalog/${pick(books)}`, { token });
    if (action === "loans") await call("my loans", "/api/v1/circulation/transactions?limit=50", { token });
    if (action === "alerts") await call("my alerts", "/api/v1/notifications/mine", { token });
    if (action === "favourites") await call("favourites", "/api/v1/favourites/mine", { token });
    requests++;
    await sleep(1000 + Math.random() * 3000);
  }
}));
const secs = (performance.now() - t0) / 1000;
report(`BROWSING: ${tokens.length} members for ${SECONDS} s, ${requests} requests (${(requests / secs).toFixed(1)} per second)`);
