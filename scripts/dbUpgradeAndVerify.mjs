import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWorkspaceLock } from "./workspaceLock.mjs";
import { assertSafePath, listTree } from "./workspacePaths.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

export function fingerprint(db) {
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index','view','trigger') AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','__app_migrations') ORDER BY type, name").all();
  return JSON.stringify(rows.map((row) => ({ ...row, sql: (row.sql ?? "").replace(/\s+/g, " ").trim() })));
}

export function migrationCheckpoints(projectRoot) {
  const migrationRoot = path.join(projectRoot, "prisma", "migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({
    name: entry.name,
    sql: readFileSync(path.join(migrationRoot, entry.name, "migration.sql"), "utf8"),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const memory = new Database(":memory:");
  try {
    const states = [fingerprint(memory)];
    for (const migration of migrations) { memory.exec(migration.sql); states.push(fingerprint(memory)); }
    return { migrations, states };
  } finally { memory.close(); }
}

function inspectOpenDatabase(db, history) {
  const integrity = db.pragma("integrity_check");
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("FAIL CLOSED: SQLite integrity check failed.");
  if (db.pragma("foreign_key_check").length) throw new Error("FAIL CLOSED: database contains foreign-key violations.");
  const schema = fingerprint(db);
  const checkpoint = history.states.indexOf(schema);
  if (checkpoint < 0) throw new Error("FAIL CLOSED: database schema does not match any committed migration checkpoint (drift or schema-ahead state).");
  const hasTable = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  const hasPrisma = hasTable("_prisma_migrations");
  const hasApp = hasTable("__app_migrations");
  if (hasPrisma || hasApp) {
    if (hasPrisma && db.prepare("SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL LIMIT 1").get()) {
      throw new Error("FAIL CLOSED: an unfinished Prisma migration requires manual recovery.");
    }
    const claimedPrisma = hasPrisma ? db.prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL").all().map((row) => row.migration_name) : [];
    const claimedApp = hasApp ? db.prepare("SELECT name FROM __app_migrations").all().map((row) => row.name) : [];
    const claimed = [...new Set([...claimedPrisma, ...claimedApp])].sort((a, b) => a.localeCompare(b));
    const expected = history.migrations.slice(0, checkpoint).map((migration) => migration.name);
    if (JSON.stringify(claimed) !== JSON.stringify(expected)) throw new Error("FAIL CLOSED: migration ledgers disagree with the schema-inferred checkpoint.");
  }
  return { checkpoint, schema, migrationNames: history.migrations.slice(0, checkpoint).map((migration) => migration.name) };
}

export function inspectDatabase(projectRoot, databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return inspectOpenDatabase(db, migrationCheckpoints(projectRoot)); }
  finally { db.close(); }
}

// The caller must own the workspace lease. Setup imports this only after npm
// dependencies are installed; the direct CLI below takes its own lease.
export function upgradeAndVerifyDatabase(projectRoot, databasePath, { backup = true } = {}) {
  const history = migrationCheckpoints(projectRoot);
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    const current = inspectOpenDatabase(db, history);
    if (current.checkpoint === history.migrations.length) return { upgraded: false, backupPath: null };
    const backupPath = backup ? `${databasePath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}` : null;
    // VACUUM INTO produces a standalone, consistent snapshot, including WAL
    // contents; copying just the .db file can silently lose committed records.
    if (backupPath) db.prepare("VACUUM INTO ?").run(backupPath);
    // Table-rebuild migrations toggle foreign_keys, which SQLite cannot change
    // inside a transaction. Disable it before BEGIN and check every FK before
    // committing the complete upgrade, rather than leaving a partial upgrade.
    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("CREATE TABLE IF NOT EXISTS __app_migrations (name TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      for (let index = current.checkpoint; index < history.migrations.length; index++) {
        const migration = history.migrations[index];
        db.exec(migration.sql);
        if (fingerprint(db) !== history.states[index + 1]) throw new Error(`schema verification failed after ${migration.name}`);
      }
      const record = db.prepare("INSERT OR IGNORE INTO __app_migrations (name) VALUES (?)");
      for (const migration of history.migrations) record.run(migration.name);
      inspectOpenDatabase(db, history);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      if (backupPath) {
        error.backupPath = backupPath;
        error.message += ` Pre-upgrade recovery snapshot retained: ${backupPath}`;
      }
      throw error;
    }
    finally { db.pragma("foreign_keys = ON"); }
    return { upgraded: true, backupPath };
  } finally { db.close(); }
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const relativePath = process.argv[2] ?? "data/app.db";
  const targetPath = path.resolve(root, relativePath);
  if (process.argv.length > 3 || path.dirname(targetPath) !== path.resolve(root, "data") || path.extname(targetPath) !== ".db") throw new Error("Target must be an explicit .db file directly in data/.");
  if (!existsSync(targetPath)) throw new Error(`Database does not exist: ${relativePath}`);
  const lease = await acquireWorkspaceLock(root, "database upgrade");
  try {
    await assertSafePath(targetPath);
    await listTree(path.dirname(targetPath));
    const result = upgradeAndVerifyDatabase(root, targetPath);
    console.log(result.upgraded ? `Upgraded and verified ${relativePath}. Backup: ${path.basename(result.backupPath)}` : "Database schema verified; no upgrade required.");
  } finally { await lease.release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
