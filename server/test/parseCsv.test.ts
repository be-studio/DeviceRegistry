import { describe, expect, it } from "vitest";
import { COLUMNS, FileError, parseCsv } from "../src/imports/parseCsv.js";

const HEADER = COLUMNS.join(",");
const ROW = "a,b,c,d,e,f,g,h,i,j,k,l";

const parse = (text: string) => parseCsv(Buffer.from(text, "utf-8"));

describe("parseCsv", () => {
  it("parses LF and CRLF files with trimmed values", () => {
    const expected = [{ line: 2, values: ["a", "b", "c"] }];
    expect(parse(`${HEADER}\n a , b,c \n`)).toMatchObject([
      { line: 2, values: ["a", "b", "c"] }
    ]);
    expect(parse(`${HEADER}\r\n a , b,c \r\n`)).toMatchObject(expected);
  });

  it("accepts a byte-order mark", () => {
    const buffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(`${HEADER}\n${ROW}`)
    ]);
    expect(parseCsv(buffer)).toHaveLength(1);
  });

  it("ignores blank lines but keeps physical line numbers", () => {
    const rows = parse(`${HEADER}\n\n${ROW}\n   \n${ROW}\n`);
    expect(rows.map((row) => row.line)).toEqual([3, 5]);
  });

  it("rejects an empty file", () => {
    expect(() => parse("")).toThrow(FileError);
    expect(() => parse("\n  \n")).toThrow(/empty/);
  });

  it("rejects invalid UTF-8", () => {
    expect(() => parseCsv(Buffer.from([0xff, 0xfe, 0x41]))).toThrow(/UTF-8/);
  });

  it("rejects a header that is not exact", () => {
    expect(() => parse(`imei,tac\n${ROW}`)).toThrow(/header/);
    expect(() => parse(`${HEADER.replace("sku", "SKU")}\n${ROW}`)).toThrow(
      /header/
    );
  });

  it("rejects a file with no data rows", () => {
    expect(() => parse(`${HEADER}\n\n`)).toThrow(/no data rows/);
  });

  it("allows 1,000 data rows but not 1,001", () => {
    const rows = (count: number) =>
      `${HEADER}\n${Array(count).fill(ROW).join("\n")}`;
    expect(parse(rows(1000))).toHaveLength(1000);
    expect(() => parse(rows(1001))).toThrow(/1001/);
  });
});
