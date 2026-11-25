import { openApiSpec } from "../src/config/openapi.js";

const spec = openApiSpec as any;
const errors: string[] = [];

if (spec.openapi !== "3.0.3") errors.push("openapi version mismatch");
if (!spec.paths || typeof spec.paths !== "object") errors.push("paths missing");

const opIds = new Set<string>();
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(methods as any)) {
    if (op.operationId) {
      if (opIds.has(op.operationId)) errors.push(`duplicate operationId: ${op.operationId}`);
      opIds.add(op.operationId);
    }
    if (!op.responses) errors.push(`missing responses: ${method.toUpperCase()} ${path}`);
  }
}

// check refs resolve
function resolve(ref: string): boolean {
  if (!ref.startsWith("#/")) return true;
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: any = spec;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return false;
  }
  return true;
}
function checkRefs(obj: any, path: string) {
  if (obj && typeof obj === "object") {
    if (typeof obj.$ref === "string" && !resolve(obj.$ref)) errors.push(`unresolved ref ${obj.$ref} at ${path}`);
    for (const [k, v] of Object.entries(obj)) checkRefs(v, `${path}/${k}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => checkRefs(v, `${path}[${i}]`));
  }
}
checkRefs(spec, "");

if (errors.length) {
  console.error("OpenAPI validation failed:");
  errors.forEach((e) => console.error(" - " + e));
  process.exit(1);
}
console.log("OpenAPI document validation passed.");