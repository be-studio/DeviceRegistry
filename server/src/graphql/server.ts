import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import type { Pool } from "pg";
import type { Context } from "./context.js";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";

// Error codes the client is allowed to see; anything else is masked
const publicCodes = new Set([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "BAD_USER_INPUT",
  "BAD_REQUEST",
  "GRAPHQL_PARSE_FAILED",
  "GRAPHQL_VALIDATION_FAILED"
]);

export async function createGraphQLMiddleware(pool: Pool) {
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    formatError: (formatted, error) => {
      const code = formatted.extensions?.code;
      if (typeof code === "string" && publicCodes.has(code)) return formatted;

      console.error(error);
      return {
        message: "Internal server error",
        extensions: { code: "INTERNAL_SERVER_ERROR" }
      };
    }
  });
  await server.start();

  return expressMiddleware(server, {
    context: async ({ req, res }) => ({ pool, viewer: req.viewer, req, res })
  });
}
