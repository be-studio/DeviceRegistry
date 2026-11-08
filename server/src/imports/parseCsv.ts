export const COLUMNS = [
  "imei",
  "tac",
  "brand",
  "model",
  "serial_number",
  "sku",
  "colour",
  "carton_serial",
  "pallet_serial",
  "production_date",
  "purchase_order",
  "destination_country"
];

export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_ROWS = 1000;

// A problem with the file as a whole rather than with one row
export class FileError extends Error {}

export interface CsvRow {
  // Physical line number in the file, counting the header and blank lines
  line: number;
  values: string[];
}

export function parseCsv(buffer: Buffer): CsvRow[] {
  let text: string;
  try {
    // Decoding strips an optional byte-order mark
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new FileError("The file is not valid UTF-8");
  }
  if (text.trim() === "") {
    throw new FileError("The file is empty");
  }

  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines[0] !== COLUMNS.join(",")) {
    throw new FileError(`The header must be exactly: ${COLUMNS.join(",")}`);
  }

  const rows: CsvRow[] = [];
  lines.forEach((text, index) => {
    if (index === 0 || text.trim() === "") return;
    rows.push({
      line: index + 1,
      values: text.split(",").map((value) => value.trim())
    });
  });

  if (rows.length === 0) {
    throw new FileError("The file has no data rows");
  }
  if (rows.length > MAX_ROWS) {
    throw new FileError(
      `The file has ${rows.length} data rows; the maximum is ${MAX_ROWS}`
    );
  }
  return rows;
}
