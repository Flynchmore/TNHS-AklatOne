import { URL } from "node:url";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function validateTarget(rawUrl) {
  if (!rawUrl) throw new Error("E2E_DATABASE_URL is required.");
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Invalid E2E_DATABASE_URL."); }
  if (parsed.protocol !== "mysql:") throw new Error("Only mysql:// URLs are allowed.");
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("Only local database hosts are allowed.");
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "aklatone_e2e") throw new Error(`Database must be exactly aklatone_e2e (got ${dbName}).`);
  return { host: parsed.hostname, database: dbName };
}

export function main() {
  if (process.env.ALLOW_E2E_DATABASE_RESET !== "1") {
    throw new Error("ALLOW_E2E_DATABASE_RESET=1 is required.");
  }
  const target = validateTarget(process.env.E2E_DATABASE_URL);
  console.log(`Verified E2E target database: ${target.database} on ${target.host}`);
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" };
  let r = spawnSync("npx", ["prisma", "migrate", "reset", "--force"], { stdio: "inherit", env, cwd: process.cwd() });
  if (r.status !== 0) process.exit(r.status ?? 1);
  r = spawnSync("npm", ["run", "prisma:seed"], { stdio: "inherit", env, cwd: process.cwd() });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("E2E database reset and seeded successfully.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}