import { GraphQLError } from "graphql";
import { checkCredentials } from "../auth/login.js";
import {
  createSession,
  deleteSession,
  findViewer,
  SESSION_COOKIE
} from "../auth/sessions.js";
import { isValidLuhn } from "../imports/luhn.js";
import type { Context } from "./context.js";

function badInput(message: string) {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" }
  });
}

// Runs before any input parsing or database access, so every non-admin gets
// the same error whether the IMEI is known, unknown or malformed
function requireAdmin(ctx: Context) {
  if (ctx.viewer?.role !== "admin") {
    throw new GraphQLError("Only admins can look up devices", {
      extensions: { code: "FORBIDDEN" }
    });
  }
}

// Used by the TAC lookup and Device.model. A TAC has a model only once an
// import for it has been accepted
const MODEL_SELECT = `SELECT t.tac, t.brand, t.model, m.name AS "manufacturerName"
  FROM tac_models t
  JOIN tac_assignments a ON a.tac = t.tac
  JOIN manufacturers m ON m.id = a.manufacturer_id`;

export const resolvers = {
  Role: {
    ADMIN: "admin",
    MANUFACTURER: "manufacturer"
  },

  Query: {
    me: (_parent: unknown, _args: unknown, ctx: Context) => ctx.viewer,

    tac: async (_parent: unknown, args: { tac: string }, ctx: Context) => {
      if (!/^\d{8}$/.test(args.tac)) {
        throw badInput("A TAC is exactly 8 digits");
      }
      const { rows } = await ctx.pool.query(
        `${MODEL_SELECT} WHERE t.tac = $1`,
        [args.tac]
      );
      return rows[0] ?? null;
    },

    device: async (_parent: unknown, args: { imei: string }, ctx: Context) => {
      requireAdmin(ctx);
      if (!/^\d{15}$/.test(args.imei) || !isValidLuhn(args.imei)) {
        throw badInput("An IMEI is 15 digits with a valid check digit");
      }
      const { rows } = await ctx.pool.query(
        `SELECT imei, tac, serial_number AS "serialNumber", sku, colour,
                carton_serial AS "cartonSerial", pallet_serial AS "palletSerial",
                production_date AS "productionDate",
                purchase_order AS "purchaseOrder",
                destination_country AS "destinationCountry"
           FROM devices WHERE imei = $1`,
        [args.imei]
      );
      return rows[0] ?? null;
    }
  },

  Device: {
    model: async (device: { tac: string }, _args: unknown, ctx: Context) => {
      const { rows } = await ctx.pool.query(
        `${MODEL_SELECT} WHERE t.tac = $1`,
        [device.tac]
      );
      return rows[0];
    }
  },

  Mutation: {
    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      ctx: Context
    ) => {
      const userId = await checkCredentials(
        ctx.pool,
        args.email,
        args.password
      );
      if (!userId) {
        // Same message for an unknown email and a wrong password
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: "UNAUTHENTICATED" }
        });
      }

      const { token, expiresAt } = await createSession(ctx.pool, userId);
      ctx.res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        expires: expiresAt
      });

      return findViewer(ctx.pool, token);
    },

    logout: async (_parent: unknown, _args: unknown, ctx: Context) => {
      const token = ctx.req.cookies?.[SESSION_COOKIE];
      if (typeof token === "string") await deleteSession(ctx.pool, token);
      ctx.res.clearCookie(SESSION_COOKIE);
      return true;
    }
  }
};
