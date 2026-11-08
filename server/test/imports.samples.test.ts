import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { graphql, LOGIN, resetDb, setupTestDb } from "./helpers.js";

// The supplied sample files live outside the repo
const samplesDir =
  process.env.SAMPLES_DIR ??
  join(homedir(), "Desktop/device-registry-requirements/samples");

const sample = (name: string) => readFileSync(join(samplesDir, name));

let pool: Pool;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  pool = await setupTestDb();
  app = await createApp(pool);
});

afterAll(() => pool.end());

async function signIn(email: string, password: string) {
  const agent = request.agent(app);
  await graphql(agent, LOGIN, { email, password });
  return agent;
}

const upload = (agent: ReturnType<typeof request.agent>, file: Buffer) =>
  agent.post("/api/imports").attach("file", file, "devices.csv");

async function count(table: string) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n as number;
}

describe("sample files, in order", () => {
  it("imports the five sample files as expected", async () => {
    await resetDb(pool);
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const boreal = await signIn("boreal@example.test", "boreal-demo-pass");

    let res = await upload(aurora, sample("01-aurora-initial.csv"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "accepted",
      newDevices: 10,
      skippedRows: 0
    });
    expect([await count("devices"), await count("tac_models")]).toEqual([
      10, 3
    ]);

    res = await upload(aurora, sample("02-aurora-later-batch.csv"));
    expect(res.body).toEqual({
      status: "accepted",
      newDevices: 5,
      skippedRows: 2
    });
    expect([await count("devices"), await count("tac_models")]).toEqual([
      15, 4
    ]);

    res = await upload(boreal, sample("03-boreal-initial.csv"));
    expect(res.body).toEqual({
      status: "accepted",
      newDevices: 10,
      skippedRows: 0
    });
    expect([await count("devices"), await count("tac_models")]).toEqual([
      25, 7
    ]);

    res = await upload(aurora, sample("04-aurora-invalid.csv"));
    expect(res.status).toBe(422);
    expect(res.body.status).toBe("rejected");
    expect(res.body.errors).toMatchObject([
      { line: 3, field: "imei" },
      { line: 4, field: "tac" },
      { line: 5, field: "model" }
    ]);
    expect([await count("devices"), await count("tac_models")]).toEqual([
      25, 7
    ]);

    res = await upload(aurora, sample("05-aurora-conflicts.csv"));
    expect(res.status).toBe(422);
    const errors: { line: number; message: string }[] = res.body.errors;
    expect([...new Set(errors.map((e) => e.line))]).toEqual([3, 4, 5]);
    // Line 4 is Boreal's IMEI: ownership error only, nothing about it being registered
    expect(errors.filter((e) => e.line === 4)).toEqual([
      {
        line: 4,
        field: "tac",
        message: "TAC is not assigned to your account"
      }
    ]);
    expect(
      errors.some((e) => e.line === 3 && /registered as/.test(e.message))
    ).toBe(true);
    expect(
      errors.some((e) => e.line === 5 && /already registered/.test(e.message))
    ).toBe(true);
    expect([await count("devices"), await count("tac_models")]).toEqual([
      25, 7
    ]);
  });

  it("does not change stored devices or save rejected rows", async () => {
    const { rows } = await pool.query(
      "SELECT colour FROM devices WHERE imei = '001234010000010'"
    );
    expect(rows).toEqual([{ colour: "Black" }]);

    const { rows: missing } = await pool.query(
      `SELECT imei FROM devices
        WHERE imei IN ('001234010001000', '001234030002004', '001234010002008')`
    );
    expect(missing).toEqual([]);
  });

  it("treats a re-upload of file 01 as all skipped", async () => {
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const res = await upload(aurora, sample("01-aurora-initial.csv"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "accepted",
      newDevices: 0,
      skippedRows: 10
    });
    expect(await count("devices")).toBe(25);
  });

  it("gives only ownership errors for another manufacturer's file", async () => {
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const res = await upload(aurora, sample("03-boreal-initial.csv"));
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(10);
    for (const error of res.body.errors) {
      expect(error.message).toBe("TAC is not assigned to your account");
    }
    expect(await count("devices")).toBe(25);
  });
});

describe("upload access and file errors", () => {
  const csv = () => sample("01-aurora-initial.csv");

  it("rejects anonymous users with 401 and admins with 403", async () => {
    await resetDb(pool);
    expect((await upload(request.agent(app), csv())).status).toBe(401);
    const admin = await signIn("admin@example.test", "admin-demo-pass");
    expect((await upload(admin, csv())).status).toBe(403);
  });

  it("ignores a manufacturerId sent with the upload", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM manufacturers WHERE name = 'Boreal Labs'"
    );
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const res = await aurora
      .post("/api/imports")
      .field("manufacturerId", rows[0].id)
      .set("x-manufacturer-id", rows[0].id)
      .attach("file", sample("03-boreal-initial.csv"), "devices.csv");
    expect(res.status).toBe(422);
    expect(await count("devices")).toBe(0);
  });

  it("returns file-level errors", async () => {
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");

    let res = await upload(aurora, Buffer.from(""));
    expect([res.status, res.body.error]).toEqual([400, "The file is empty"]);

    res = await aurora.post("/api/imports");
    expect(res.status).toBe(400);

    res = await upload(aurora, Buffer.alloc(1024 * 1024 + 1, "a"));
    expect(res.status).toBe(413);
  });
});
