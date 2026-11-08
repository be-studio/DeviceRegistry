import type { Pool } from "pg";
import type { Agent } from "supertest";
import { runMigrations } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { seed } from "../src/db/seed.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://registry:registry@localhost:5433/registry_test";

// Migrates the test database and starts it from the demo seed data
export async function setupTestDb() {
  const pool = createPool(testDatabaseUrl);
  await runMigrations(pool);
  await resetDb(pool);
  return pool;
}

export async function resetDb(pool: Pool) {
  await pool.query(
    `TRUNCATE devices, tac_models, tac_assignments, sessions, users, manufacturers CASCADE`
  );
  await seed(pool);
}

export function graphql(
  agent: Agent,
  query: string,
  variables: Record<string, unknown> = {}
) {
  return agent.post("/graphql").send({ query, variables });
}

export const LOGIN = `mutation ($email: String!, $password: String!) {
  login(email: $email, password: $password) { email role manufacturerName }
}`;
