import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensurePgVectorExtension() {
  try {
    // Drizzle не создаёт extension сам по себе.
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
  } catch (e) {
    logger.warn({ err: e }, "Failed to ensure pgvector extension");
  }
}

ensurePgVectorExtension()
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((e) => {
    logger.error({ err: e }, "Server start failed");
    process.exit(1);
  });
