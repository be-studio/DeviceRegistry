import type { Pool } from "pg";
import { parseCsv } from "./parseCsv.js";
import {
  validateRow,
  type DeviceRow,
  type ImportError
} from "./validateRow.js";

export type ImportResult =
  | { status: "accepted"; newDevices: number; skippedRows: number }
  | { status: "rejected"; errors: ImportError[] };

interface LocatedRow {
  line: number;
  row: DeviceRow;
}

const OWNERSHIP_MESSAGE = "TAC is not assigned to your account";

function sameDevice(a: DeviceRow, b: DeviceRow) {
  return (Object.keys(a) as (keyof DeviceRow)[]).every(
    (key) => a[key] === b[key]
  );
}

// Throws FileError for a bad file; otherwise returns the import outcome.
// Nothing is saved unless every row is valid, owned and consistent
export async function importDevices(
  pool: Pool,
  manufacturerId: string,
  file: Buffer
): Promise<ImportResult> {
  const csvRows = parseCsv(file);
  const ownedTacs = await findOwnedTacs(pool, manufacturerId);

  const errors: ImportError[] = [];
  const rows: LocatedRow[] = [];

  for (const { line, values } of csvRows) {
    const tac = values[1] ?? "";
    // A well-formed TAC we do not own gets this error only, so nothing about
    // other manufacturers' devices can be learned from the response
    if (values.length === 12 && /^\d{8}$/.test(tac) && !ownedTacs.has(tac)) {
      errors.push({ line, field: "tac", message: OWNERSHIP_MESSAGE });
      continue;
    }
    const result = validateRow(line, values);
    errors.push(...result.errors);
    if (result.row) rows.push({ line, row: result.row });
  }

  // Checks within the file: one brand/model per TAC, one record per IMEI
  const tacModels = new Map<string, LocatedRow>();
  const devices = new Map<string, LocatedRow>();
  let skippedRows = 0;

  for (const located of rows) {
    const { line, row } = located;

    const first = tacModels.get(row.tac);
    if (!first) {
      tacModels.set(row.tac, located);
    } else if (first.row.brand !== row.brand || first.row.model !== row.model) {
      errors.push({
        line,
        field: "model",
        message: `Brand/model for TAC ${row.tac} differs from line ${first.line}`
      });
    }

    const earlier = devices.get(row.imei);
    if (!earlier) {
      devices.set(row.imei, located);
    } else if (sameDevice(earlier.row, row)) {
      skippedRows++;
    } else {
      errors.push({
        line,
        field: "imei",
        message: `IMEI ${row.imei} has different details from line ${earlier.line}`
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Checks against the registry. Every row here is for a TAC the caller owns
    const storedModels = await client.query(
      "SELECT tac, brand, model FROM tac_models WHERE tac = ANY($1)",
      [[...tacModels.keys()]]
    );
    const storedByTac = new Map<string, { brand: string; model: string }>(
      storedModels.rows.map((r) => [r.tac, r])
    );
    for (const { line, row } of rows) {
      const stored = storedByTac.get(row.tac);
      if (
        stored &&
        (stored.brand !== row.brand || stored.model !== row.model)
      ) {
        errors.push({
          line,
          field: "model",
          message: `TAC ${row.tac} is already registered as ${stored.brand} ${stored.model}`
        });
      }
    }

    const storedDevices = await client.query(
      `SELECT imei, tac, serial_number, sku, colour, carton_serial, pallet_serial,
              production_date, purchase_order, destination_country
         FROM devices WHERE imei = ANY($1)`,
      [[...devices.keys()]]
    );
    const storedByImei = new Map<string, DeviceRow>(
      storedDevices.rows.map((r) => [r.imei, toDeviceRow(r, storedByTac)])
    );

    const newDevices: DeviceRow[] = [];
    for (const { line, row } of devices.values()) {
      const stored = storedByImei.get(row.imei);
      if (!stored) {
        newDevices.push(row);
      } else if (sameDevice(stored, row)) {
        skippedRows++;
      } else {
        errors.push({
          line,
          field: "imei",
          message: `IMEI ${row.imei} is already registered with different details`
        });
      }
    }

    if (errors.length > 0) {
      await client.query("ROLLBACK");
      return {
        status: "rejected",
        errors: errors.sort((a, b) => a.line - b.line)
      };
    }

    await insertNewModels(client, tacModels, storedByTac);
    await insertDevices(client, newDevices);
    await client.query("COMMIT");
    return { status: "accepted", newDevices: newDevices.length, skippedRows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findOwnedTacs(pool: Pool, manufacturerId: string) {
  const { rows } = await pool.query(
    "SELECT tac FROM tac_assignments WHERE manufacturer_id = $1",
    [manufacturerId]
  );
  return new Set<string>(rows.map((r) => r.tac));
}

// Turns a stored device back into the CSV shape so it can be compared
function toDeviceRow(
  r: Record<string, string | null>,
  storedByTac: Map<string, { brand: string; model: string }>
): DeviceRow {
  const model = storedByTac.get(r.tac!)!;
  return {
    imei: r.imei!,
    tac: r.tac!,
    brand: model.brand,
    model: model.model,
    serialNumber: r.serial_number!,
    sku: r.sku!,
    colour: r.colour!,
    cartonSerial: r.carton_serial!,
    palletSerial: r.pallet_serial!,
    productionDate: r.production_date ?? "",
    purchaseOrder: r.purchase_order ?? "",
    destinationCountry: r.destination_country ?? ""
  };
}

async function insertNewModels(
  client: { query: Pool["query"] },
  tacModels: Map<string, LocatedRow>,
  storedByTac: Map<string, unknown>
) {
  const added = [...tacModels.values()].filter(
    ({ row }) => !storedByTac.has(row.tac)
  );
  if (added.length === 0) return;
  await client.query(
    `INSERT INTO tac_models (tac, brand, model)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])`,
    [
      added.map(({ row }) => row.tac),
      added.map(({ row }) => row.brand),
      added.map(({ row }) => row.model)
    ]
  );
}

// Optional values are stored as NULL rather than empty text
async function insertDevices(
  client: { query: Pool["query"] },
  rows: DeviceRow[]
) {
  if (rows.length === 0) return;
  const orNull = (value: string) => (value === "" ? null : value);
  await client.query(
    `INSERT INTO devices (imei, tac, serial_number, sku, colour, carton_serial,
                          pallet_serial, production_date, purchase_order,
                          destination_country)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                          $5::text[], $6::text[], $7::text[], $8::date[],
                          $9::text[], $10::text[])`,
    [
      rows.map((r) => r.imei),
      rows.map((r) => r.tac),
      rows.map((r) => r.serialNumber),
      rows.map((r) => r.sku),
      rows.map((r) => r.colour),
      rows.map((r) => r.cartonSerial),
      rows.map((r) => r.palletSerial),
      rows.map((r) => orNull(r.productionDate)),
      rows.map((r) => orNull(r.purchaseOrder)),
      rows.map((r) => orNull(r.destinationCountry))
    ]
  );
}
