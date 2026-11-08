import type { Pool } from "pg";
import { hashPassword, verifyPassword } from "./password.js";

// Checked when the email is unknown, so both failures take about as long
const dummyHash = hashPassword("not-a-real-password");

// Returns the user id when the credentials are right, otherwise null
export async function checkCredentials(
  pool: Pool,
  email: string,
  password: string
) {
  const { rows } = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()]
  );
  const user = rows[0];
  const ok = await verifyPassword(
    password,
    user ? user.password_hash : await dummyHash
  );
  return user && ok ? user.id : null;
}
