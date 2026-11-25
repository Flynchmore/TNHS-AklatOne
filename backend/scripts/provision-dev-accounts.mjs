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

export async function main() {
  if (process.env.ALLOW_DEV_ACCOUNTS !== "1") throw new Error("ALLOW_DEV_ACCOUNTS=1 is required.");
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") throw new Error("NODE_ENV must be development.");
  validateTarget(process.env.DATABASE_URL);

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

  let libUser = process.env.DEV_TEACHER_USERNAME;
  let libPass = process.env.DEV_TEACHER_PASSWORD;
  let memUser = process.env.DEV_STUDENT_USERNAME;
  let memPass = process.env.DEV_STUDENT_PASSWORD;

  if (!libUser) libUser = await promptHidden("Teacher username: ");
  if (!libPass) libPass = await promptHidden("Teacher password: ");
  if (!memUser) memUser = await promptHidden("Student username: ");
  if (!memPass) memPass = await promptHidden("Student password: ");

  if (!libUser || !libPass || !memUser || !memPass) throw new Error("All usernames and passwords are required.");

  const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  const teacherRole = await prisma.role.findUnique({ where: { name: "TEACHER" } });
  const studentRole = await prisma.role.findUnique({ where: { name: "STUDENT" } });
  if (!teacherRole || !studentRole) throw new Error("Required roles are missing.");

  const toCreate = [];
  for (const [username, password, role] of [[libUser, libPass, teacherRole], [memUser, memPass, studentRole]]) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`Skipping existing user: ${username}`);
      continue;
    }
    const hash = await bcrypt.hash(password, 10);
    toCreate.push({ username, passwordHash: hash, roleId: role.id, roleName: role.name });
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const u of toCreate) {
        await tx.user.create({ data: { username: u.username, passwordHash: u.passwordHash, roleId: u.roleId } });
        console.log(`Created user: ${u.username} (${u.roleName})`);
      }
    });
  }

  await prisma.$disconnect();
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}