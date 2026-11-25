import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Load compiled? Use tsx at runtime via npm script instead.
console.log("Use: npx tsx scripts/validate-openapi.ts");