import { describe, expect, it } from "vitest";
import { appLabel, devOtp } from "../src/common/devOtp.js";

describe("[DEV OTP] in the backend terminal", () => {
  it("says which app asked for the code", () => {
    expect(appLabel("android")).toBe("MOBILE APP");
    expect(appLabel("ios")).toBe("MOBILE APP");
    expect(appLabel("web-mobile")).toBe("MOBILE APP (browser)");
    expect(appLabel("web")).toBe("WEB APP");
    expect(appLabel("desktop")).toBe("DESKTOP APP");
    expect(appLabel(undefined)).toBe("API");
  });
  it("never prints during automated tests (or in production)", () => {
    expect(devOtp("login", "juan", "123456")).toBeNull();
  });
});
