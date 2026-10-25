import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/database.js";

const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function runMigrations(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();

    for (const file of files) {
      await client.query("select pg_advisory_lock(hashtext($1))", ["baaki:schema_migrations"]);
      try {
        await client.query("begin");
        const alreadyApplied = await client.query(
          "select 1 from public.schema_migrations where version = $1",
          [file],
        );
        if (alreadyApplied.rowCount > 0) {
          await client.query("commit");
          continue;
        }

        const migration = await readFile(path.join(migrationsDirectory, file), "utf8");
        await client.query(migration);
        await client.query("insert into public.schema_migrations (version) values ($1)", [file]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        error.migration = file;
        throw error;
      } finally {
        await client.query("select pg_advisory_unlock(hashtext($1))", ["baaki:schema_migrations"]);
      }
    }
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runMigrations();
    console.info("Database migrations are up to date.");
  } catch (error) {
    console.error("Database migration failed.", {
      migration: error.migration,
      code: error.code,
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
