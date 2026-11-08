import { isValidLuhn } from "./luhn.js";
import { COLUMNS } from "./parseCsv.js";

export interface ImportError {
  line: number;
  field?: string;
  message: string;
}

// One CSV row; empty optional values are kept as empty strings
export interface DeviceRow {
  imei: string;
  tac: string;
  brand: string;
  model: string;
  serialNumber: string;
  sku: string;
  colour: string;
  cartonSerial: string;
  palletSerial: string;
  productionDate: string;
  purchaseOrder: string;
  destinationCountry: string;
}

export function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rejects dates such as 2026-02-30 that roll over into the next month
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Values must already be trimmed. Reports every problem in the row, not just the first
export function validateRow(line: number, values: string[]) {
  const errors: ImportError[] = [];
  const fail = (field: string, message: string) =>
    errors.push({ line, field, message });

  if (values.length !== COLUMNS.length) {
    errors.push({
      line,
      message: `Expected ${COLUMNS.length} columns but found ${values.length}`
    });
    return { row: null, errors };
  }

  const [
    imei,
    tac,
    brand,
    model,
    serialNumber,
    sku,
    colour,
    cartonSerial,
    palletSerial,
    productionDate,
    purchaseOrder,
    destinationCountry
  ] = values as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ];

  if (!/^\d{15}$/.test(imei)) {
    fail("imei", "IMEI must be exactly 15 digits");
  } else if (!isValidLuhn(imei)) {
    fail("imei", "IMEI has an invalid check digit");
  }

  if (!/^\d{8}$/.test(tac)) {
    fail("tac", "TAC must be exactly 8 digits");
  } else if (/^\d{15}$/.test(imei) && !imei.startsWith(tac)) {
    fail("tac", "TAC does not match the first 8 digits of the IMEI");
  }

  const required = {
    brand,
    model,
    serial_number: serialNumber,
    sku,
    colour,
    carton_serial: cartonSerial,
    pallet_serial: palletSerial
  };
  for (const [field, value] of Object.entries(required)) {
    if (value === "") fail(field, `${field} is required`);
  }

  if (productionDate !== "" && !isValidDate(productionDate)) {
    fail("production_date", "production_date must be a valid YYYY-MM-DD date");
  }
  if (destinationCountry !== "" && !/^[A-Z]{2}$/.test(destinationCountry)) {
    fail(
      "destination_country",
      "destination_country must be two uppercase letters"
    );
  }

  if (errors.length > 0) return { row: null, errors };

  const row: DeviceRow = {
    imei,
    tac,
    brand,
    model,
    serialNumber,
    sku,
    colour,
    cartonSerial,
    palletSerial,
    productionDate,
    purchaseOrder,
    destinationCountry
  };
  return { row, errors };
}
