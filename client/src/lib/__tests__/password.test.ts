import { describe, it, expect } from "vitest";
import { checkPassword, passwordStrength, passwordValid } from "../password";

describe("password policy", () => {
  it("requires 8+ chars, an uppercase letter and a symbol", () => {
    expect(passwordValid("short1!")).toBe(false); // too short
    expect(passwordValid("lowercase1!")).toBe(false); // no uppercase
    expect(passwordValid("NoSymbol123")).toBe(false); // no symbol
    expect(passwordValid("Valid123!")).toBe(true);
  });

  it("reports individual checks", () => {
    const c = checkPassword("Abc!");
    expect(c.minLength).toBe(false);
    expect(c.hasUpper).toBe(true);
    expect(c.hasSymbol).toBe(true);
  });

  it("rates strength weak / moderate / strong", () => {
    expect(passwordStrength("abc")).toBe("weak");
    expect(passwordStrength("password")).toBe("weak");
    expect(passwordStrength("Password1")).toBe("moderate"); // no symbol → capped
    expect(passwordStrength("Str0ng!Pass")).toBe("strong");
  });

  it("never reports strong unless the policy is met", () => {
    // long + mixed but missing a symbol must not read "strong"
    expect(passwordStrength("Abcdefghijkl1")).not.toBe("strong");
  });
});
