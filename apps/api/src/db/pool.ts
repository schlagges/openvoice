import pg from "pg";

export function createPostgresPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
  });
}
