// Regression: a database this script has ALREADY upgraded once records those
// migrations in its own __app_migrations ledger, not _prisma_migrations. The
// ledger cross-check must count both, or every second upgrade fails closed.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";

const testRequire = createRequire(import.meta.url);
type SqliteDatabase = { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown }; close(): void };
const BetterSqlite3 = testRequire("better-sqlite3") as new (filename: string) => SqliteDatabase;

const ROOT = path.resolve(__dirname, "../../..");
// The script only accepts targets directly inside data/ — data/*.db is git-ignored.
const DB_PATH = path.join(ROOT, "data", "upgrade-ledger-test.db");

function committedMigrations(): { name: string; sql: string }[] {
  const migrationRoot = path.join(ROOT, "prisma", "migrations");
  return readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, sql: readFileSync(path.join(migrationRoot, entry.name, "migration.sql"), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

afterAll(() => {
  for (const suffix of ["", "-journal"]) rmSync(`${DB_PATH}${suffix}`, { force: true });
  for (const entry of readdirSync(path.join(ROOT, "data"))) {
    if (entry.startsWith("upgrade-ledger-test.db.backup-")) rmSync(path.join(ROOT, "data", entry), { force: true });
  }
});

describe("dbUpgradeAndVerify ledger cross-check", () => {
  it("upgrades a database whose history is split across the Prisma and app ledgers", () => {
    const migrations = committedMigrations();
    expect(migrations.length).toBeGreaterThan(15); // 12 prisma-era + 3 app-era + at least one pending

    rmSync(DB_PATH, { force: true });
    const db = new BetterSqlite3(DB_PATH);
    try {
      // First 12 applied in the prisma-migrate era…
      db.exec(
        'CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "finished_at" DATETIME, "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" DATETIME, "started_at" DATETIME NOT NULL DEFAULT current_timestamp, "applied_steps_count" INTEGER NOT NULL DEFAULT 0)'
      );
      for (const migration of migrations.slice(0, 12)) {
        db.exec(migration.sql);
        db.prepare("INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, ?, ?, datetime('now'), 1)").run(
          migration.name,
          "test",
          migration.name
        );
      }
      // …the next three by a previous run of this very script.
      db.exec("CREATE TABLE __app_migrations (name TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      for (const migration of migrations.slice(12, 15)) {
        db.exec(migration.sql);
        db.prepare("INSERT INTO __app_migrations (name) VALUES (?)").run(migration.name);
      }
    } finally {
      db.close();
    }

    const result = spawnSync("node", [path.join(ROOT, "scripts", "dbUpgradeAndVerify.mjs"), "data/upgrade-ledger-test.db"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(result.stderr).not.toMatch(/FAIL CLOSED/);
    expect(result.status).toBe(0);

    const upgraded = new BetterSqlite3(DB_PATH);
    try {
      expect(upgraded.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='TitleAlias'").get()).toBeTruthy();
    } finally {
      upgraded.close();
    }
    expect(existsSync(DB_PATH)).toBe(true);
  });
});
