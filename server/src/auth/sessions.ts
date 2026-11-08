import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface Viewer {
  userId: string;
  email: string;
  role: "admin" | "manufacturer";
  manufacturerId: string | null;
  manufacturerName: string | null;
}

// Only the hash is stored, so a leaked database cannot be used to sign in
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(pool: Pool, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt]
  );
  return { token, expiresAt };
}

export async function findViewer(pool: Pool, token: string) {
  const { rows } = await pool.query(
    `SELECT u.id AS "userId", u.email, u.role,
            u.manufacturer_id AS "manufacturerId",
            m.name AS "manufacturerName"
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN manufacturers m ON m.id = u.manufacturer_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  return (rows[0] as Viewer | undefined) ?? null;
}

export async function deleteSession(pool: Pool, token: string) {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
    hashToken(token)
  ]);
}
