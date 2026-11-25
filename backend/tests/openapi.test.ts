import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openApiSpec } from "../src/config/openapi.js";

// Reads the route files, so a new endpoint without documentation fails this test.
function routesInCode(): string[] {
  const app = readFileSync("src/app.ts", "utf8");
  const mounts = new Map([...app.matchAll(/api\.use\("(\/[^"]+)",[^;]*?(\w+Router)\)/g)].map((m) => [m[2]!, m[1]!]));
  const out: string[] = [];
  for (const mod of readdirSync("src/modules")) {
    for (const f of readdirSync(join("src/modules", mod)).filter((f) => f.endsWith(".routes.ts"))) {
      const src = readFileSync(join("src/modules", mod, f), "utf8");
      for (const m of src.matchAll(/(\w+Router)\.(get|post|patch|put|delete)\(\s*"([^"]*)"/g)) {
        const base = mounts.get(m[1]!);
        if (!base) continue;
        const path = (base + (m[3] === "/" ? "" : m[3])).replace(/:(\w+)/g, "{$1}");
        out.push(`${m[2]} ${path}`);
      }
    }
  }
  return out;
}

describe("OpenAPI document", () => {
  it("lists every API route", () => {
    const paths = openApiSpec.paths as Record<string, Record<string, unknown>>;
    const routes = routesInCode();
    expect(routes.length).toBeGreaterThan(60);
    const missing = routes.filter((r) => { const [m, p] = r.split(" "); return !paths[p!]?.[m!]; });
    expect(missing).toEqual([]);
  });

  it("documents nothing that does not exist", () => {
    const routes = new Set(routesInCode());
    const extra = Object.entries(openApiSpec.paths as Record<string, Record<string, unknown>>).flatMap(([p, ms]) => Object.keys(ms).map((m) => `${m} ${p}`)).filter((r) => !routes.has(r));
    expect(extra).toEqual([]);
  });
});
