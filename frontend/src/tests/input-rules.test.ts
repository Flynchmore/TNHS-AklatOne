import { describe, expect, it } from "vitest";
import { rules, withRule } from "../lib/inputRules";

describe("input rules", () => {
  it("lets each kind of field take only what it should", () => {
    expect(rules.digits("12a-3")).toBe("123");
    expect(rules.name("Juan2 Dela  Cruz!")).toBe("Juan Dela Cruz");
    expect(rules.name("Ma. Niña O'Brien-Santos")).toBe("Ma. Niña O'Brien-Santos");
    expect(rules.words("Teacher III, Science & Math #1")).toBe("Teacher III, Science & Math 1");
    expect(rules.username("juan dc@2026")).toBe("juandc2026");
    expect(rules.isbn("978-971 x")).toBe("978-971X");
    expect(rules.code("nmt 001")).toBe("NMT001");
  });
  it("rewrites the typed value before the form sees it", () => {
    let seen = "";
    const e = { target: { value: "ab12" } };
    withRule("digits", (ev: typeof e) => { seen = ev.target.value; })!(e);
    expect(seen).toBe("12");
  });
});
