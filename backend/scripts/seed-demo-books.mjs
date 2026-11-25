// Adds sample catalog books (no user/student data) to the DEV database for demos.
// Safe to re-run: books that already exist (same ISBN, or same title when no ISBN) are skipped. Deletes nothing.
// Usage: ALLOW_DEMO_SEED=1 npm run seed:demo-books
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { validateTarget, verifyDatabaseIdentity } from "./provision-dev-librarian.mjs";

export const DEMO_BOOKS = [
  { title: "Noli Me Tángere", authors: "José Rizal", isbn: "9780143039693", publishedYear: 1887, copies: 3 },
  { title: "El Filibusterismo", authors: "José Rizal", isbn: "9780143106395", publishedYear: 1891, copies: 3 },
  { title: "Florante at Laura", authors: "Francisco Balagtas", publishedYear: 1838, copies: 2 },
  { title: "To Kill a Mockingbird", authors: "Harper Lee", isbn: "9780061120084", publishedYear: 1960, copies: 2 },
  { title: "Nineteen Eighty-Four", authors: "George Orwell", isbn: "9780451524935", publishedYear: 1949, copies: 2 },
  { title: "The Little Prince", authors: "Antoine de Saint-Exupéry", isbn: "9780156012195", publishedYear: 1943, copies: 2 },
  { title: "The Alchemist", authors: "Paulo Coelho", isbn: "9780062315007", publishedYear: 1988, copies: 2 },
  { title: "Charlotte's Web", authors: "E. B. White", isbn: "9780064400558", publishedYear: 1952, copies: 1 },
  { title: "The Diary of a Young Girl", authors: "Anne Frank", isbn: "9780553296983", publishedYear: 1947, copies: 1 },
  { title: "The Hobbit", authors: "J. R. R. Tolkien", isbn: "9780547928227", publishedYear: 1937, copies: 2 },
  { title: "A Brief History of Time", authors: "Stephen Hawking", isbn: "9780553380163", publishedYear: 1988, copies: 1 },
  { title: "Wonder", authors: "R. J. Palacio", isbn: "9780375869020", publishedYear: 2012, copies: 2 },
];

export async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "1") throw new Error("ALLOW_DEMO_SEED=1 is required.");
  validateTarget(process.env.DATABASE_URL); // local host, port 3307, database aklatone only
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  try {
    verifyDatabaseIdentity(await prisma.$queryRaw`SELECT DATABASE() AS db`);
    let added = 0, skipped = 0;
    for (const [i, b] of DEMO_BOOKS.entries()) {
      const exists = b.isbn
        ? await prisma.book.findUnique({ where: { isbn: b.isbn } })
        : await prisma.book.findFirst({ where: { title: b.title, authors: b.authors } });
      if (exists) { skipped++; continue; }
      const { copies, ...data } = b;
      await prisma.book.create({
        data: {
          ...data,
          copies: { create: Array.from({ length: copies }, (_, n) => ({ barcode: `DEMO-${String(i + 1).padStart(3, "0")}-${n + 1}`, location: "Demo shelf" })) },
        },
      });
      added++;
    }
    console.log(`Demo books: ${added} added, ${skipped} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
