import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Корневой `.env` монорепозитория (PORT, DATABASE_URL, …). */
const rootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

config({ path: rootEnvPath });
