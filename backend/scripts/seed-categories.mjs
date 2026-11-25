// Adds the starting Subject / Wattpad / Genre categories. Idempotent: existing ones are left alone.
// Usage: ALLOW_CATEGORY_SEED=1 npm run seed:categories   (uses DATABASE_URL)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

if (process.env.ALLOW_CATEGORY_SEED !== "1") {
  console.error("Refusing to run: set ALLOW_CATEGORY_SEED=1.");
  process.exit(1);
}

export const CATEGORIES = {
  // Subjects named by the developer (2026-11-20).
  SUBJECT: ["Science", "Mathematics", "MAPEH", "Filipino", "Araling Panlipunan (AP)", "TLE", "ESP", "English"],
  // Starting lists; librarians can add or rename through the categories API.
  WATTPAD: ["Teen Fiction", "Romance", "Fantasy", "Mystery/Thriller", "Humor", "Short Story", "Poetry"],
  GENRE: ["Horror", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Mystery", "Romance", "Science Fiction"],
};

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
let added = 0;
for (const [kind, names] of Object.entries(CATEGORIES)) {
  for (const name of names) {
    const exists = await prisma.category.findFirst({ where: { kind, name }, select: { id: true } });
    if (!exists) { await prisma.category.create({ data: { kind, name } }); added++; }
  }
}
console.log(`Categories ready (${added} added).`);
await prisma.$disconnect();
