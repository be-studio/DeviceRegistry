import { GraphQLError } from "graphql";
import { checkCredentials } from "../auth/login.js";
import {
  createSession,
  deleteSession,
  findViewer,
  SESSION_COOKIE
} from "../auth/sessions.js";
import type { Context } from "./context.js";

export const resolvers = {
  Role: {
    ADMIN: "admin",
    MANUFACTURER: "manufacturer"
  },

  Query: {
    me: (_parent: unknown, _args: unknown, ctx: Context) => ctx.viewer
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
