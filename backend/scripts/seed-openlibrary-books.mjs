// TEMPORARY test catalog for the user testing (about 400 books with covers from Open Library), DEV database only.
// The school's DepEd textbooks have no ISBN and are not in Open Library; remove these before entering real books.
//   Add:    ALLOW_DEMO_SEED=1 npm run seed:openlibrary
//   Remove: ALLOW_DEMO_SEED=1 npm run seed:openlibrary -- --remove
// Safe to re-run: every book gets serial number OL-<Open Library work id>, so a book already added is skipped.
// --remove deletes the OL- books that were never borrowed or requested, and hides the rest (history is kept).
import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { validateTarget, verifyDatabaseIdentity } from "./provision-dev-librarian.mjs";

// [Open Library subject, category kind, category name] (category names from scripts/seed-categories.mjs).
export const QUERIES = [
  ["biology", "SUBJECT", "Science"], ["chemistry", "SUBJECT", "Science"], ["physics", "SUBJECT", "Science"], ["earth sciences", "SUBJECT", "Science"],
  ["mathematics", "SUBJECT", "Mathematics"], ["algebra", "SUBJECT", "Mathematics"], ["geometry", "SUBJECT", "Mathematics"],
  ["english language", "SUBJECT", "English"], ["english literature", "SUBJECT", "English"],
  ["philippines", "SUBJECT", "Araling Panlipunan (AP)"], ["world history", "SUBJECT", "Araling Panlipunan (AP)"], ["economics", "SUBJECT", "Araling Panlipunan (AP)"],
  ["music", "SUBJECT", "MAPEH"], ["art", "SUBJECT", "MAPEH"], ["physical fitness", "SUBJECT", "MAPEH"], ["health", "SUBJECT", "MAPEH"],
  ["cooking", "SUBJECT", "TLE"], ["computers", "SUBJECT", "TLE"], ["ethics", "SUBJECT", "Values Education"], ["tagalog literature", "SUBJECT", "Filipino"],
  ["horror", "GENRE", "Horror"], ["adventure", "GENRE", "Adventure"], ["fantasy", "GENRE", "Fantasy"], ["mystery", "GENRE", "Mystery"],
  ["romance", "GENRE", "Romance"], ["science fiction", "GENRE", "Science Fiction"], ["humor", "GENRE", "Comedy"], ["drama", "GENRE", "Drama"],
  ["young adult fiction", "WATTPAD", "Teen Fiction"], ["short stories", "WATTPAD", "Short Story"], ["poetry", "WATTPAD", "Poetry"],
];
const PER_QUERY = Number(process.env.PER_QUERY ?? 14);
// A generic client name (no personal contact details are sent to Open Library).
const UA = { "User-Agent": "AklatOne-test-catalog/1.0" };

/** One Open Library search result -> AklatOne book fields, or null when it lacks a cover, author or work id. */
export function toBook(doc, kind, category) {
  const work = String(doc.key ?? "").replace("/works/", "");
  if (!/^OL\d+W$/.test(work) || !doc.cover_i || !doc.title || !doc.author_name?.length) return null;
  const isbn = (doc.isbn ?? []).find((i) => /^97[89]\d{10}$/.test(i)) ?? null;
  const year = Number(doc.first_publish_year);
  return {
    serialNumber: `OL-${work}`,
    title: String(doc.title).slice(0, 255),
    authors: doc.author_name.slice(0, 2).join(", ").slice(0, 255),
    isbn,
    publisher: doc.publisher?.[0]?.slice(0, 255) ?? null,
    publishedYear: year >= 1 && year <= 3000 ? year : null,
    coverUrl: `https://covers.openlibrary.org/b/id/${Number(doc.cover_i)}-M.jpg`,
    description: `Open Library test record (${work}); temporary sample for system testing.`,
    category: { kind, name: category },
  };
}

async function search(subject) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(`subject:"${subject}"`)}&fields=key,title,author_name,isbn,publisher,first_publish_year,cover_i&lang=en&limit=${PER_QUERY * 2}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) return (await r.json()).docs ?? [];
    if (attempt === 3) throw new Error(`Open Library search failed for "${subject}" (${r.status})`);
    await sleep(2000 * attempt);
  }
}

export async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "1") throw new Error("ALLOW_DEMO_SEED=1 is required.");
  validateTarget(process.env.DATABASE_URL); // local host, port 3307, database aklatone only
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  try {
    verifyDatabaseIdentity(await prisma.$queryRaw`SELECT DATABASE() AS db`);

    if (process.argv.includes("--remove")) {
      const books = await prisma.book.findMany({ where: { serialNumber: { startsWith: "OL-" } }, select: { id: true, _count: { select: { borrowRequests: true } }, copies: { select: { _count: { select: { transactions: true } } } } } });
      const used = books.filter((b) => b._count.borrowRequests || b.copies.some((c) => c._count.transactions)).map((b) => b.id);
      const unused = books.map((b) => b.id).filter((id) => !used.includes(id));
      await prisma.book.deleteMany({ where: { id: { in: unused } } });
      await prisma.book.updateMany({ where: { id: { in: used } }, data: { isHidden: true } });
      console.log(`Open Library test books: ${unused.length} deleted, ${used.length} hidden (they have borrowing history).`);
      return;
    }

    const categories = await prisma.category.findMany({ select: { id: true, kind: true, name: true } });
    const catId = (kind, name) => categories.find((c) => c.kind === kind && c.name === name)?.id;
    let added = 0, skipped = 0;
    const seenIsbn = new Set();
    for (const [subject, kind, name] of QUERIES) {
      const category = catId(kind, name);
      if (!category) throw new Error(`Category ${kind} "${name}" is missing: run ALLOW_CATEGORY_SEED=1 npm run seed:categories first.`);
      let taken = 0;
      for (const doc of await search(subject)) {
        if (taken >= PER_QUERY) break;
        const b = toBook(doc, kind, name);
        if (!b) continue;
        taken++;
        if (await prisma.book.findUnique({ where: { serialNumber: b.serialNumber }, select: { id: true } })) { skipped++; continue; }
        // ISBN is unique in AklatOne; drop it if another book already uses it.
        if (b.isbn && (seenIsbn.has(b.isbn) || (await prisma.book.findUnique({ where: { isbn: b.isbn }, select: { id: true } })))) b.isbn = null;
        if (b.isbn) seenIsbn.add(b.isbn);
        const copies = 1 + (added % 3);
        const { category: _c, ...data } = b;
        await prisma.book.create({
          data: {
            ...data,
            categories: { connect: [{ id: category }] },
            copies: { create: Array.from({ length: copies }, (_, n) => ({ barcode: `${b.serialNumber}-${String(n + 1).padStart(2, "0")}`, location: "Test shelf" })) },
          },
        });
        added++;
      }
      console.log(`  ${subject.padEnd(22)} -> ${kind} ${name}: ${taken} books`);
      await sleep(400); // be gentle with the free Open Library API
    }
    console.log(`Open Library test books: ${added} added, ${skipped} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
