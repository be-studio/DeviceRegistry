// Carries the server's error code so pages can show a matching message
export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  const body = await response.json();

  const error = body.errors?.[0];
  if (error) {
    throw new GraphQLRequestError(
      error.message,
      error.extensions?.code ?? "INTERNAL_SERVER_ERROR"
    );
  }
  return body.data as T;
}
