import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.resolve(root, "data");
const requestedPath = process.argv[2];

if (!requestedPath) {
  throw new Error("Usage: node scripts/prepareE2eDatabase.mjs data/e2e.db --reset");
}

const databasePath = path.resolve(root, requestedPath);
if (path.dirname(databasePath) !== dataDirectory || path.extname(databasePath) !== ".db") {
  throw new Error("Only an explicit SQLite database directly within data/ may be prepared.");
}
if (process.argv.includes("--reset") && existsSync(databasePath)) {
  rmSync(databasePath);
}
mkdirSync(dataDirectory, { recursive: true });

const database = new Database(databasePath);
try {
  database.exec("PRAGMA foreign_keys = ON;");
  const migrationsDirectory = path.join(root, "prisma", "migrations");
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    database.exec(readFileSync(path.join(migrationsDirectory, migration, "migration.sql"), "utf8"));
  }

  // Verify the actual database state needed by the submission workflow. This
  // intentionally verifies SQLite metadata rather than trusting a CLI exit code.
  const requiredColumns = {
    Application: ["submissionState", "submissionConfirmedAt"],
    ApplyRun: ["idempotencyKey", "submissionEvidence", "reviewedAt"],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const present = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name));
    for (const column of columns) {
      if (!present.has(column)) throw new Error(`Database verification failed: ${table}.${column} is missing.`);
    }
  }

  const indexes = database.prepare('PRAGMA index_list("ApplyRun")').all();
  if (!indexes.some((index) => index.name === "ApplyRun_idempotencyKey_key" && index.unique === 1)) {
    throw new Error("Database verification failed: ApplyRun idempotency unique index is missing.");
  }
} finally {
  database.close();
}

console.log(`Prepared and verified ${path.relative(root, databasePath)}.`);
