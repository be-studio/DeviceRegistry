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

  # Public model information only: no path to devices, counts or accounts
  type TacModel {
    tac: String!
    brand: String!
    model: String!
    manufacturerName: String!
  }

  type Device {
    imei: String!
    serialNumber: String!
    sku: String!
    colour: String!
    cartonSerial: String!
    palletSerial: String!
    productionDate: String
    purchaseOrder: String
    destinationCountry: String
    model: TacModel!
  }

  type Query {
    me: Viewer
    tac(tac: String!): TacModel
    device(imei: String!): Device
  }

  type Mutation {
    login(email: String!, password: String!): Viewer!
    logout: Boolean!
  }
`;
