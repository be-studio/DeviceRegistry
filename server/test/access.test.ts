import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { graphql, LOGIN, resetDb, setupTestDb } from "./helpers.js";

const DEVICE = `query ($imei: String!) {
  device(imei: $imei) {
    imei serialNumber sku colour cartonSerial palletSerial productionDate
    purchaseOrder destinationCountry
    model { tac brand model manufacturerName }
  }
}`;
const TAC = `query ($tac: String!) {
  tac(tac: $tac) { tac brand model manufacturerName }
}`;

// Valid IMEI from sample 01 (imported), and one with a valid check digit that was never imported
const KNOWN_IMEI = "001234010000010";
const UNKNOWN_IMEI = "001234010000002";

let pool: Pool;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  pool = await setupTestDb();
  app = await createApp(pool);
  await resetDb(pool);
  const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
  const res = await aurora
    .post("/api/imports")
    .attach(
      "file",
      readFileSync(join(import.meta.dirname, "fixtures/01-aurora-initial.csv")),
      "devices.csv"
    );
  expect(res.body.status).toBe("accepted");
});

afterAll(() => pool.end());

async function signIn(email: string, password: string) {
  const agent = request.agent(app);
  await graphql(agent, LOGIN, { email, password });
  return agent;
}

const anonymous = () => request.agent(app);

describe("device lookup", () => {
  it("gives anonymous and manufacturer callers the same FORBIDDEN error for any IMEI", async () => {
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const callers = [anonymous(), aurora];

    const bodies = [];
    for (const agent of callers) {
      for (const imei of [KNOWN_IMEI, UNKNOWN_IMEI, "not-an-imei"]) {
        const res = await graphql(agent, DEVICE, { imei });
        expect(res.body.data.device).toBeNull();
        expect(res.body.errors[0].extensions.code).toBe("FORBIDDEN");
        bodies.push(res.body);
      }
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it("returns the full record to an admin", async () => {
    const admin = await signIn("admin@example.test", "admin-demo-pass");
    const res = await graphql(admin, DEVICE, { imei: KNOWN_IMEI });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.device).toEqual({
      imei: KNOWN_IMEI,
      serialNumber: "DEMO-AUR-SN-0000001",
      sku: "DEMO-AUR-OM2-BLK",
      colour: "Black",
      cartonSerial: "DEMO-AUR-CTN-OM2-BLK-01",
      palletSerial: "DEMO-AUR-PAL-0001",
      productionDate: "2026-10-12",
      purchaseOrder: "DEMO-PO-AUR-26001",
      destinationCountry: "GB",
      model: {
        tac: "00123401",
        brand: "Aurora",
        model: "Orbit Mini Gen2",
        manufacturerName: "Aurora Devices"
      }
    });
  });

  it("gives an admin null for an unknown IMEI and an error for a malformed one", async () => {
    const admin = await signIn("admin@example.test", "admin-demo-pass");

    const unknown = await graphql(admin, DEVICE, { imei: UNKNOWN_IMEI });
    expect(unknown.body.errors).toBeUndefined();
    expect(unknown.body.data.device).toBeNull();

    for (const imei of ["123", "00123401000001X", "001234010000011"]) {
      const res = await graphql(admin, DEVICE, { imei });
      expect(res.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
    }
  });
});

describe("TAC lookup", () => {
  it("is public and returns model information", async () => {
    const res = await graphql(anonymous(), TAC, { tac: "00123401" });

    expect(res.body.data.tac).toEqual({
      tac: "00123401",
      brand: "Aurora",
      model: "Orbit Mini Gen2",
      manufacturerName: "Aurora Devices"
    });
  });

  it("returns null for an unassigned TAC and for one with no accepted import", async () => {
    // 35000001 is in no assignment; 00987601 is assigned to Boreal, who has not imported yet
    for (const tac of ["35000001", "00987601"]) {
      const res = await graphql(anonymous(), TAC, { tac });
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.tac).toBeNull();
    }
  });

  it("rejects a malformed TAC", async () => {
    const res = await graphql(anonymous(), TAC, { tac: "1234" });
    expect(res.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");
  });

  it("exposes no path to devices, counts or accounts", async () => {
    const res = await graphql(
      anonymous(),
      `
        {
          __type(name: "TacModel") {
            fields {
              name
            }
          }
        }
      `
    );
    const fields = res.body.data.__type.fields.map(
      (f: { name: string }) => f.name
    );
    expect(fields.sort()).toEqual([
      "brand",
      "manufacturerName",
      "model",
      "tac"
    ]);
  });
});

describe("identity", () => {
  it("takes identity only from the session cookie, not from headers or variables", async () => {
    const aurora = await signIn("aurora@example.test", "aurora-demo-pass");
    const res = await aurora
      .post("/graphql")
      .set("x-role", "admin")
      .set("x-manufacturer-id", "anything")
      .send({
        query: DEVICE,
        variables: { imei: KNOWN_IMEI, role: "admin", manufacturerId: "x" }
      });
    expect(res.body.errors[0].extensions.code).toBe("FORBIDDEN");
  });

  it("rejects uploads from anonymous callers and admins", async () => {
    const admin = await signIn("admin@example.test", "admin-demo-pass");
    const file = Buffer.from("imei\n");

    const anon = await anonymous()
      .post("/api/imports")
      .attach("file", file, "d.csv");
    const asAdmin = await admin
      .post("/api/imports")
      .attach("file", file, "d.csv");
    expect(anon.status).toBe(401);
    expect(asAdmin.status).toBe(403);
  });
});
