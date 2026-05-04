import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import pg from "pg";

interface Migration {
  readonly name: string;
  readonly sql: string;
}

export async function runMigrations(
  databaseUrl: string,
  migrationsDirectory = resolveMigrationsDirectory(),
): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const migrations = await readMigrations(migrationsDirectory);

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue;
      }

      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function readMigrations(migrationsDirectory: string): Promise<Migration[]> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (name) => ({
      name,
      sql: await readFile(path.join(migrationsDirectory, name), "utf8"),
    })),
  );
}

function resolveMigrationsDirectory(): string {
  if (process.env.MIGRATIONS_DIR) {
    return path.resolve(process.env.MIGRATIONS_DIR);
  }

  const rootMigrations = path.resolve(process.cwd(), "migrations");
  const packageMigrations = path.resolve(process.cwd(), "../../migrations");
  return process.cwd().endsWith("apps/api") ? packageMigrations : rootMigrations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  await runMigrations(databaseUrl);
}
