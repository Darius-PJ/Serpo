import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type SqliteDatabase = {
  exec(sql: string): void;
  close(): void;
};
type SqliteConstructor = new (filename: string) => SqliteDatabase;

const testRequire = createRequire(import.meta.url);
// This is the same SQLite driver used by the Prisma adapter in lib/db/prisma.
// Loading it dynamically avoids relying on an undeclared TypeScript definition
// from a transitive package.
const BetterSqlite3 = testRequire("better-sqlite3") as SqliteConstructor;

/** Apply the committed SQL migrations to an empty test database with context-rich failures. */
export function migrateTestDatabase(root: string, databasePath: string) {
  const migrationsPath = path.join(root, "prisma", "migrations");
  const database = new BetterSqlite3(databasePath);

  try {
    database.exec("PRAGMA foreign_keys = ON;");
    const migrationNames = readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migrationName of migrationNames) {
      const migrationPath = path.join(migrationsPath, migrationName, "migration.sql");
      try {
        const sql = readFileSync(migrationPath, "utf8");
        database.exec(sql);
      } catch (error) {
        throw new Error(`Failed to apply SQLite test migration ${migrationName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    database.close();
  }
}
