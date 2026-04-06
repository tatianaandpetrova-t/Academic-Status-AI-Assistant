/**
 * Кроссплатформенная проверка: установка только через pnpm.
 * Удаляет lockfile других менеджеров, если они появились в корне.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

for (const name of ["package-lock.json", "yarn.lock"]) {
  const p = path.join(root, name);
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e && e.code !== "ENOENT") throw e;
  }
}

const ua = process.env.npm_config_user_agent || "";
if (!ua.includes("pnpm")) {
  console.error("Use pnpm instead of npm or yarn.");
  process.exit(1);
}
