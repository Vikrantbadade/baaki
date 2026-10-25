import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

const { Pool } = pg;

pg.types.setTypeParser(20, (value) => {
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("PostgreSQL integer exceeds the safe JavaScript integer range");
  }
  return Number(parsed);
});
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1184, (value) => new Date(value).toISOString());
pg.types.setTypeParser(1700, (value) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  logger.error({ databaseCode: error.code }, "Unexpected idle PostgreSQL client error");
});

export async function checkDatabaseReadiness() {
  await pool.query("select 1");
}

export async function withTransaction(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId) {
      await client.query("select set_config('app.user_id', $1, true)", [userId]);
    }
    const result = await callback({
      query: (text, values) => client.query(text, values),
    });
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createUserDatabase(userId) {
  return Object.freeze({
    userId,
    query(text, values) {
      return withTransaction(userId, (client) => client.query(text, values));
    },
    transaction(callback) {
      return withTransaction(userId, callback);
    },
  });
}
