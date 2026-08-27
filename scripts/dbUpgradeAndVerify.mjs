import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativePath = process.argv[2] ?? "data/app.db";
const targetPath = path.resolve(root, relativePath);
if (path.dirname(targetPath) !== path.resolve(root, "data") || path.extname(targetPath) !== ".db") throw new Error("Target must be an explicit .db file directly in data/.");
if (!existsSync(targetPath)) throw new Error(`Database does not exist: ${relativePath}`);

const migrationRoot = path.join(root, "prisma", "migrations");
const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({
  name: entry.name,
  sql: readFileSync(path.join(migrationRoot, entry.name, "migration.sql"), "utf8"),
})).sort((a, b) => a.name.localeCompare(b.name));

function fingerprint(db) {
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','__app_migrations') ORDER BY type, name").all();
  return JSON.stringify(rows.map((row) => ({ ...row, sql: (row.sql ?? "").replace(/\s+/g, " ").trim() })));
}
function checkpoints() {
  const memory = new Database(":memory:");
  const states = [fingerprint(memory)];
  for (const migration of migrations) { memory.exec(migration.sql); states.push(fingerprint(memory)); }
  memory.close();
  return states;
}
const states = checkpoints();
const db = new Database(targetPath);
try {
  const current = fingerprint(db);
  const checkpoint = states.indexOf(current);
  if (checkpoint < 0) throw new Error("FAIL CLOSED: database schema does not match any committed migration checkpoint (drift or schema-ahead state).");
  const hasPrismaLedger = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'").get();
  if (hasPrismaLedger) {
    const claimed = db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at").all().map((row) => row.migration_name);
    const expected = migrations.slice(0, checkpoint).map((migration) => migration.name);
    if (JSON.stringify(claimed) !== JSON.stringify(expected)) throw new Error("FAIL CLOSED: Prisma migration ledger disagrees with the schema-inferred checkpoint.");
  }
  if (checkpoint === migrations.length) { console.log("Database schema verified; no upgrade required."); process.exit(0); }
  const backup = `${targetPath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(targetPath, backup);
  db.exec("CREATE TABLE IF NOT EXISTS __app_migrations (name TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (let index = checkpoint; index < migrations.length; index++) {
    const migration = migrations[index];
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      if (fingerprint(db) !== states[index + 1]) throw new Error(`schema verification failed after ${migration.name}`);
      db.prepare("INSERT OR IGNORE INTO __app_migrations (name) VALUES (?)").run(migration.name);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  if (fingerprint(db) !== states.at(-1)) throw new Error("FAIL CLOSED: final schema differs from committed migration history.");
  console.log(`Upgraded and verified ${relativePath}. Backup: ${path.basename(backup)}`);
} finally { db.close(); }
