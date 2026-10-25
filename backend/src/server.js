import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { pool } from "./config/database.js";
import { runMigrations } from "./database/migrate.js";

await runMigrations();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, environment: env.NODE_ENV }, "Baaki API listening");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down server");
  server.close((error) => {
    pool.end();
    if (error) {
      logger.error({ err: error }, "Server shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
