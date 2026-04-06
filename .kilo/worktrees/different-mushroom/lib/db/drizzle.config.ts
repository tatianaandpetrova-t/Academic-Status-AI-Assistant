import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "path";

// Скрипт `drizzle-kit` запускается с cwd = каталог пакета `lib/db`
config({ path: path.resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
