import { URL } from "node:url";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

export function validateTarget(rawUrl) {
  if (!rawUrl) throw new Error("DATABASE_URL is required.");
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Invalid DATABASE_URL."); }
  if (parsed.protocol !== "mysql:") throw new Error("Only mysql:// URLs are allowed.");
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("Only local database hosts are allowed.");
  if (parsed.port !== "3307") throw new Error("Development database must use port 3307.");
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "aklatone") throw new Error(`Development database must be aklatone (got ${dbName}).`);
  return parsed;
}

export function verifyDatabaseIdentity(result) {
  if (!Array.isArray(result) || result.length === 0) throw new Error("Database identity check failed.");
  const db = result[0]?.db ?? result[0]?.["DATABASE()"] ?? result[0]?.database;
  if (db !== "aklatone") throw new Error(`Connected database is not aklatone (got ${db}).`);
}

async function promptHidden(question) {
  process.stderr.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    const onData = (chunk) => {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(1);
        if (ch === "\u007f") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

export async function main() {
  if (process.env.ALLOW_DEV_ACCOUNTS !== "1") throw new Error("ALLOW_DEV_ACCOUNTS=1 is required.");
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") throw new Error("NODE_ENV must be development.");
  validateTarget(process.env.DATABASE_URL);

  let username = process.env.DEV_LIBRARIAN_USERNAME;
  let password = process.env.DEV_LIBRARIAN_PASSWORD;
  if (!username) username = await promptHidden("Librarian username: ");
  if (!password) password = await promptHidden("Librarian password: ");
  if (!username || !password) throw new Error("Username and password are required.");
  if (username.length < 3) throw new Error("Username must be at least 3 characters.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  const identity = await prisma.$queryRaw`SELECT DATABASE() AS db`;
  verifyDatabaseIdentity(identity);

  const role = await prisma.role.findUnique({ where: { name: "LIBRARIAN" } });
  if (!role) throw new Error("LIBRARIAN role is missing.");

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log("Skipping: that user already exists.");
    await prisma.$disconnect();
    return;
  }

  const hash = await bcrypt.hash(password, rounds);
  await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { username, passwordHash: hash, roleId: role.id } });
    console.log("Created the LIBRARIAN account.");
  });

  await prisma.$disconnect();
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}