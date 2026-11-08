export const typeDefs = `#graphql
  enum Role {
    ADMIN
    MANUFACTURER
  }

  type Viewer {
    email: String!
    role: Role!
    manufacturerName: String
  }

  type Query {
    me: Viewer
  }

  type Mutation {
    login(email: String!, password: String!): Viewer!
    logout: Boolean!
  }
`;
