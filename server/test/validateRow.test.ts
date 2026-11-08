import { describe, expect, it } from "vitest";
import { validateRow } from "../src/imports/validateRow.js";

const VALID = [
  "001234010000010",
  "00123401",
  "Aurora",
  "Orbit Mini Gen2",
  "SN-1",
  "SKU-1",
  "Black",
  "CTN-1",
  "PAL-1",
  "2026-10-12",
  "PO-1",
  "GB"
];

// Replaces one column (by index) in the valid row
function withValue(index: number, value: string) {
  return VALID.map((current, i) => (i === index ? value : current));
}

function errorsFor(index: number, value: string) {
  return validateRow(2, withValue(index, value)).errors;
}

describe("validateRow", () => {
  it("accepts a valid row", () => {
    const { row, errors } = validateRow(2, VALID);
    expect(errors).toEqual([]);
    expect(row).toMatchObject({ imei: "001234010000010", tac: "00123401" });
  });

  it("accepts empty optional fields", () => {
    const values = withValue(9, "");
    values[10] = "";
    values[11] = "";
    expect(validateRow(2, values).errors).toEqual([]);
  });

  it("rejects the wrong number of columns", () => {
    expect(validateRow(7, VALID.slice(1)).errors).toEqual([
      { line: 7, message: "Expected 12 columns but found 11" }
    ]);
  });

  it("rejects a malformed IMEI", () => {
    expect(errorsFor(0, "00123401000001")[0]?.field).toBe("imei");
    expect(errorsFor(0, "0012340100 0010")[0]?.field).toBe("imei");
    expect(errorsFor(0, "00123401000001X")[0]?.field).toBe("imei");
  });

  it("rejects a bad check digit", () => {
    expect(errorsFor(0, "001234010000011")).toMatchObject([
      { field: "imei", message: expect.stringContaining("check digit") }
    ]);
  });

  it("rejects a malformed TAC", () => {
    expect(errorsFor(1, "1234")[0]?.field).toBe("tac");
  });

  it("rejects a TAC that does not match the IMEI prefix", () => {
    expect(errorsFor(1, "00123403")).toMatchObject([
      { field: "tac", message: expect.stringContaining("does not match") }
    ]);
  });

  it.each([
    [2, "brand"],
    [3, "model"],
    [4, "serial_number"],
    [5, "sku"],
    [6, "colour"],
    [7, "carton_serial"],
    [8, "pallet_serial"]
  ])("requires column %i (%s)", (index, field) => {
    expect(errorsFor(index, "")).toMatchObject([{ field }]);
  });

  it("checks production dates against the calendar", () => {
    expect(errorsFor(9, "2026-02-28")).toEqual([]);
    expect(errorsFor(9, "2026-02-30")[0]?.field).toBe("production_date");
    expect(errorsFor(9, "2026-13-01")[0]?.field).toBe("production_date");
    expect(errorsFor(9, "12/10/2026")[0]?.field).toBe("production_date");
  });

  it("requires a two-letter uppercase destination country", () => {
    expect(errorsFor(11, "gb")[0]?.field).toBe("destination_country");
    expect(errorsFor(11, "GBR")[0]?.field).toBe("destination_country");
    expect(errorsFor(11, "G1")[0]?.field).toBe("destination_country");
  });

  it("reports every problem in a row", () => {
    const values = withValue(0, "bad");
    values[2] = "";
    expect(validateRow(2, values).errors).toHaveLength(2);
  });
});
