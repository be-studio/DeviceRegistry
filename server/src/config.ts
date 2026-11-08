export const config = {
  port: Number(process.env.PORT ?? 3000),
  webDir: process.env.WEB_DIR,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://registry:registry@localhost:5433/registry"
};
