import pg from "pg";
import { config } from "../config.js";

// Return DATE columns as plain "YYYY-MM-DD" strings, avoiding timezone shifts
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export function createPool(connectionString = config.databaseUrl) {
  return new pg.Pool({ connectionString });
}
