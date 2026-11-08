import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { hashPassword } from "../auth/password.js";
import { createPool } from "./pool.js";

// Demo data only: synthetic accounts, documented in the README
const manufacturers = [
  {
    name: "Aurora Devices",
    tacs: ["00123401", "00123402", "00123403", "00123404"]
  },
  { name: "Boreal Labs", tacs: ["00987601", "00987602", "00987603"] }
];

export const demoUsers = [
  {
    email: "admin@example.test",
    password: "admin-demo-pass",
    manufacturer: null
  },
  {
    email: "aurora@example.test",
    password: "aurora-demo-pass",
    manufacturer: "Aurora Devices"
  },
  {
    email: "boreal@example.test",
    password: "boreal-demo-pass",
    manufacturer: "Boreal Labs"
  }
];

// Safe to run repeatedly: existing rows are left alone
export async function seed(pool: Pool) {
  const ids = new Map<string, string>();

  for (const m of manufacturers) {
    await pool.query(
      "INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT DO NOTHING",
      [m.name]
    );
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM manufacturers WHERE name = $1",
      [m.name]
    );
    const id = rows[0]!.id;
    ids.set(m.name, id);

    for (const tac of m.tacs) {
      await pool.query(
        `INSERT INTO tac_assignments (tac, manufacturer_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [tac, id]
      );
    }
  }

  for (const u of demoUsers) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, manufacturer_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [
        u.email,
        await hashPassword(u.password),
        u.manufacturer ? "manufacturer" : "admin",
        u.manufacturer ? ids.get(u.manufacturer) : null
      ]
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  seed(pool)
    .then(() => console.log("Seeded demo data"))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
