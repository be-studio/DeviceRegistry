import request from "supertest";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { graphql, LOGIN, resetDb, setupTestDb } from "./helpers.js";

const ME = "{ me { email role manufacturerName } }";

let pool: Pool;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  pool = await setupTestDb();
});

beforeEach(async () => {
  await resetDb(pool);
  agent = request.agent(await createApp(pool));
});

afterAll(() => pool.end());

describe("login", () => {
  it("signs in a manufacturer and sets a httpOnly cookie", async () => {
    const res = await graphql(agent, LOGIN, {
      email: "aurora@example.test",
      password: "aurora-demo-pass"
    });

    expect(res.body.data.login).toEqual({
      email: "aurora@example.test",
      role: "MANUFACTURER",
      manufacturerName: "Aurora Devices"
    });
    const cookie = res.headers["set-cookie"]![0]!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("signs in the admin without a manufacturer", async () => {
    const res = await graphql(agent, LOGIN, {
      email: "admin@example.test",
      password: "admin-demo-pass"
    });

    expect(res.body.data.login).toEqual({
      email: "admin@example.test",
      role: "ADMIN",
      manufacturerName: null
    });
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPassword = await graphql(agent, LOGIN, {
      email: "aurora@example.test",
      password: "nope"
    });
    const unknownEmail = await graphql(agent, LOGIN, {
      email: "nobody@example.test",
      password: "nope"
    });

    expect(wrongPassword.body.errors[0].extensions.code).toBe(
      "UNAUTHENTICATED"
    );
    expect(unknownEmail.body.errors).toEqual(wrongPassword.body.errors);
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
  });

  it("stores only a hash of the session token", async () => {
    const res = await graphql(agent, LOGIN, {
      email: "boreal@example.test",
      password: "boreal-demo-pass"
    });
    const token = /session=([^;]+)/.exec(res.headers["set-cookie"]![0]!)![1]!;

    const { rows } = await pool.query("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
  });
});

describe("me and logout", () => {
  it("returns null without a session", async () => {
    const res = await graphql(agent, ME);
    expect(res.body.data.me).toBeNull();
  });

  it("returns the viewer while signed in", async () => {
    await graphql(agent, LOGIN, {
      email: "aurora@example.test",
      password: "aurora-demo-pass"
    });

    const res = await graphql(agent, ME);
    expect(res.body.data.me.email).toBe("aurora@example.test");
  });

  it("ignores a forged or unknown session cookie", async () => {
    const res = await graphql(
      request.agent(await createApp(pool)).set("Cookie", "session=forged"),
      ME
    );
    expect(res.body.data.me).toBeNull();
  });

  it("ends the session on logout", async () => {
    const login = await graphql(agent, LOGIN, {
      email: "aurora@example.test",
      password: "aurora-demo-pass"
    });
    const cookie = login.headers["set-cookie"]![0]!.split(";")[0]!;

    const out = await graphql(agent, "mutation { logout }");
    expect(out.body.data.logout).toBe(true);
    expect((await graphql(agent, ME)).body.data.me).toBeNull();

    // The old cookie no longer works, because the session row is gone
    const replay = request.agent(await createApp(pool)).set("Cookie", cookie);
    expect((await graphql(replay, ME)).body.data.me).toBeNull();
  });

  it("rejects an expired session", async () => {
    await graphql(agent, LOGIN, {
      email: "aurora@example.test",
      password: "aurora-demo-pass"
    });
    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 minute'"
    );

    expect((await graphql(agent, ME)).body.data.me).toBeNull();
  });
});
