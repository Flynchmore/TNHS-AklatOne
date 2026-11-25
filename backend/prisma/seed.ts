import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const roles = [
  { name: "ADMIN", description: "Full system access", permissions: ["*"] },
  { name: "LIBRARIAN", description: "Library staff access", permissions: ["categories:read", "categories:write", "catalog:read", "catalog:write", "copies:read", "copies:write", "circulation:read", "circulation:write", "users:read", "users:write", "reports:read", "backup:manage"] },
  { name: "MEMBER", description: "Library member access", permissions: ["catalog:read", "categories:read"] },
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: role.permissions },
      create: role,
    });
  }

  // The test admin (known password) is for development and automated tests only, never a live server.
  if (process.env.NODE_ENV === "production") return;
  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (adminRole) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash("TestPass123!", 10);
    await prisma.user.upsert({
      where: { username: "e2e_admin" },
      update: { passwordHash: hash },
      create: { username: "e2e_admin", passwordHash: hash, roleId: adminRole.id },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });