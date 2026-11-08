import { describe, expect, it } from "vitest";
import { isValidLuhn } from "../src/imports/luhn.js";

describe("isValidLuhn", () => {
  it("accepts a valid IMEI, including leading zeros", () => {
    expect(isValidLuhn("001234010000010")).toBe(true);
    expect(isValidLuhn("490154203237518")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidLuhn("001234010000011")).toBe(false);
    expect(isValidLuhn("001234020001009")).toBe(false);
  });
});
