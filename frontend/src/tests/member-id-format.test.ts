import { describe, expect, it } from "vitest";
import { MEMBER_ID, formatMemberId } from "../lib/memberId";

describe("Member ID field", () => {
  it("keeps 2 letters then 6 digits, in capitals, 8 characters at most", () => {
    expect(formatMemberId("ca123456")).toBe("CA123456");
    expect(formatMemberId("c1")).toBe("C");
    expect(formatMemberId("CAB12")).toBe("CA12");
    expect(formatMemberId("CA12a34-5678")).toBe("CA123456");
    expect(formatMemberId(" ca 123 456 ")).toBe("CA123456");
    expect(MEMBER_ID.test(formatMemberId("ca123456"))).toBe(true);
  });
});
