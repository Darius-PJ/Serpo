import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backupWorkspace, restoreWorkspace } from "../../scripts/workspace.mjs";
import { inspectDatabase, migrationCheckpoints, upgradeAndVerifyDatabase } from "../../scripts/dbUpgradeAndVerify.mjs";
import { acquireWorkspaceLock } from "../../scripts/workspaceLock.mjs";
import { hashFile, pathExists } from "../../scripts/workspacePaths.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fixture(t) {
  const inheritedDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "file:./data/app.db";
  t.after(() => {
    if (inheritedDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = inheritedDatabase;
  });
  const scratch = await mkdtemp(path.join(tmpdir(), "serpo-workspace-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const root = await createRoot(scratch, "original");
  return { scratch, root, backup: path.join(scratch, "backup") };
}

async function createRoot(scratch, name, { checkpoint } = {}) {
  const root = path.join(scratch, name);
  await mkdir(path.join(root, "data", "resumes", "application"), { recursive: true });
  await mkdir(path.join(root, "data", "raekwon-archive", "owner"), { recursive: true });
  await cp(path.join(repository, "prisma", "migrations"), path.join(root, "prisma", "migrations"), { recursive: true });
  const migrations = migrationCheckpoints(root).migrations;
  const db = new Database(path.join(root, "data", "app.db"));
  try {
    for (const migration of migrations.slice(0, checkpoint ?? migrations.length)) db.exec(migration.sql);
    db.prepare("INSERT INTO Application (id,company,role,source,lastStatusChangeAt,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run("application", "Original employer", "Engineer", "manual");
    if (db.prepare("PRAGMA table_info('ApplyRun')").all().some((column) => column.name === "tailoredResumePath")) {
      db.prepare("INSERT INTO ApplyRun (id,applicationId,tailoredResumePath) VALUES (?,?,?)").run("run", "application", path.join(root, "data", "resumes", "application", "run.docx"));
    }
  } finally { db.close(); }
  await writeFile(path.join(root, "data", "resumes", "application", "run.docx"), "Original résumé bytes");
  await writeFile(path.join(root, "data", "raekwon-archive", "owner", "leads.json"), '{"leads":[{"name":"Original lead"}]}');
  await writeFile(path.join(root, "data", "app.db.jobspy-state.json"), '{"lastRequestAt":12345}');
  await writeFile(path.join(root, ".env.local"), "ANTHROPIC_API_KEY=scratch-only-key");
  await writeFile(path.join(root, "data", "keep.txt"), "Unrecognized local data");
  await writeFile(path.join(root, "data", "app.db.backup-owner"), "Existing migration backup");
  await mkdir(path.join(root, "data", "browser-profile"));
  await writeFile(path.join(root, "data", "browser-profile", "cookies"), "Private browser cookies");
  return root;
}

function row(root) {
  const db = new Database(path.join(root, "data", "app.db"), { readonly: true });
  try {
    return { company: db.prepare("SELECT company FROM Application WHERE id='application'").get().company,
      resume: db.prepare("SELECT tailoredResumePath FROM ApplyRun WHERE id='run'").get()?.tailoredResumePath };
  } finally { db.close(); }
}

async function changeFileEntry(backup, relative) {
  const manifestFile = path.join(backup, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const file = path.join(backup, ...relative.split("/"));
  const entry = manifest.files.find((item) => item.path === relative);
  entry.size = (await readFile(file)).length;
  entry.sha256 = await hashFile(file);
  await writeFile(manifestFile, JSON.stringify(manifest));
}

test("backup, mutate, restore recovers records and associated files without importing credentials or dropping excluded local data", async (t) => {
  const f = await fixture(t);
  const originalResumePath = row(f.root).resume;
  await backupWorkspace(f.root, f.backup);
  assert.equal(row(f.root).resume, originalResumePath, "backup must not rewrite live paths");
  assert.equal(row(f.backup).resume, "data/resumes/application/run.docx");
  assert.equal(await pathExists(path.join(f.backup, ".env.local")), false);
  assert.equal(await pathExists(path.join(f.backup, "data", "browser-profile")), false);
  assert.equal(await pathExists(path.join(f.backup, "data", "app.db.backup-owner")), false);
  const db = new Database(path.join(f.root, "data", "app.db"));
  db.prepare("UPDATE Application SET company='Changed employer' WHERE id='application'").run(); db.close();
  await writeFile(path.join(f.root, "data", "resumes", "application", "run.docx"), "Changed résumé bytes");
  await writeFile(path.join(f.root, "data", "raekwon-archive", "owner", "leads.json"), "Changed archive");
  await writeFile(path.join(f.root, "data", "app.db.jobspy-state.json"), "Changed cooldowns");
  await writeFile(path.join(f.root, ".env.local"), "ANTHROPIC_API_KEY=keep-new-local-key");
  const restored = await restoreWorkspace(f.root, f.backup);
  assert.equal(row(f.root).company, "Original employer");
  assert.equal(await readFile(path.resolve(f.root, row(f.root).resume), "utf8"), "Original résumé bytes");
  assert.equal(await readFile(path.join(f.root, "data", "raekwon-archive", "owner", "leads.json"), "utf8"), '{"leads":[{"name":"Original lead"}]}');
  assert.equal(await readFile(path.join(f.root, "data", "app.db.jobspy-state.json"), "utf8"), '{"lastRequestAt":12345}');
  assert.equal(await readFile(path.join(f.root, ".env.local"), "utf8"), "ANTHROPIC_API_KEY=keep-new-local-key");
  assert.equal(await readFile(path.join(f.root, "data", "browser-profile", "cookies"), "utf8"), "Private browser cookies");
  assert.equal(await readFile(path.join(f.root, "data", "keep.txt"), "utf8"), "Unrecognized local data");
  assert.equal(await readFile(path.join(f.root, "data", "app.db.backup-owner"), "utf8"), "Existing migration backup");
  const previous = new Database(path.join(restored.previousData, "app.db"), { readonly: true });
  try { assert.equal(previous.prepare("SELECT company FROM Application WHERE id='application'").get().company, "Changed employer"); }
  finally { previous.close(); }
  assert.equal(await readFile(path.join(restored.previousData, "resumes", "application", "run.docx"), "utf8"), "Changed résumé bytes");
});

test("restoring under a different root resolves every backed-up absolute résumé reference in the new workspace", async (t) => {
  const f = await fixture(t);
  await backupWorkspace(f.root, f.backup);
  const destination = await createRoot(f.scratch, "different-root");
  await writeFile(path.join(destination, "data", "resumes", "application", "run.docx"), "Different-root old bytes");
  const result = await restoreWorkspace(destination, f.backup);
  await rm(f.root, { recursive: true });
  const resolved = path.resolve(destination, row(destination).resume);
  assert.equal(await readFile(resolved, "utf8"), "Original résumé bytes");
  assert.equal(path.relative(destination, resolved), path.join("data", "resumes", "application", "run.docx"));
  assert.equal(await readFile(path.join(result.previousData, "resumes", "application", "run.docx"), "utf8"), "Different-root old bytes");
});

test("SQLite backup captures committed WAL records rather than only the stale main file", async (t) => {
  const f = await fixture(t);
  const db = new Database(path.join(f.root, "data", "app.db"));
  try {
    db.pragma("journal_mode = WAL");
    db.prepare("UPDATE Application SET company='Committed WAL employer' WHERE id='application'").run();
    await backupWorkspace(f.root, f.backup);
    assert.equal(row(f.backup).company, "Committed WAL employer");
  } finally { db.close(); }
});

test("malformed, corrupt, drifted and ledger-inconsistent backups leave the original database and files unchanged", async (t) => {
  const cases = [
    ["malformed JSON", async (backup) => writeFile(path.join(backup, "manifest.json"), "{invalid")],
    ["traversal", async (backup) => {
      const file = path.join(backup, "manifest.json"); const manifest = JSON.parse(await readFile(file, "utf8"));
      manifest.files[0].path = "../outside.txt"; await writeFile(file, JSON.stringify(manifest));
    }],
    ["artifact corruption", async (backup) => writeFile(path.join(backup, "data", "resumes", "application", "run.docx"), "Damaged bytes")],
    ["corrupt SQLite with a valid file checksum", async (backup) => { await writeFile(path.join(backup, "data", "app.db"), "Not a SQLite database"); await changeFileEntry(backup, "data/app.db"); }],
    ["schema ahead/drift", async (backup) => {
      const db = new Database(path.join(backup, "data", "app.db")); db.exec("CREATE TABLE UnknownFutureTable (id TEXT PRIMARY KEY)"); db.close(); await changeFileEntry(backup, "data/app.db");
    }],
    ["false migration ledger", async (backup) => {
      const db = new Database(path.join(backup, "data", "app.db")); db.exec("CREATE TABLE __app_migrations (name TEXT PRIMARY KEY); INSERT INTO __app_migrations VALUES ('uncommitted_migration')"); db.close(); await changeFileEntry(backup, "data/app.db");
    }],
    ["broken foreign keys", async (backup) => {
      const db = new Database(path.join(backup, "data", "app.db")); db.pragma("foreign_keys = OFF"); db.exec("UPDATE ApplyRun SET applicationId='missing-application'"); db.close(); await changeFileEntry(backup, "data/app.db");
    }],
    ["unsafe stored résumé reference", async (backup) => {
      const db = new Database(path.join(backup, "data", "app.db")); db.prepare("UPDATE ApplyRun SET tailoredResumePath=?").run("../outside.docx"); db.close(); await changeFileEntry(backup, "data/app.db");
    }],
  ];
  for (const [name, damage] of cases) await t.test(name, async (subtest) => {
    const f = await fixture(subtest);
    await backupWorkspace(f.root, f.backup);
    await damage(f.backup);
    const originalHash = await hashFile(path.join(f.root, "data", "app.db"));
    await assert.rejects(restoreWorkspace(f.root, f.backup));
    assert.equal(await hashFile(path.join(f.root, "data", "app.db")), originalHash);
    assert.equal(await readFile(path.join(f.root, "data", "resumes", "application", "run.docx"), "utf8"), "Original résumé bytes");
    assert.equal(await readFile(path.join(f.root, ".env.local"), "utf8"), "ANTHROPIC_API_KEY=scratch-only-key");
  });
});

test("known older schema snapshots upgrade only in staging before restoring", async (t) => {
  const f = await fixture(t);
  const history = migrationCheckpoints(f.root);
  const oldRoot = await createRoot(f.scratch, "older", { checkpoint: history.migrations.length - 1 });
  await backupWorkspace(oldRoot, f.backup);
  await restoreWorkspace(f.root, f.backup);
  assert.equal(inspectDatabase(f.root, path.join(f.root, "data", "app.db")).checkpoint, history.migrations.length);
  assert.equal(row(f.root).company, "Original employer");
});

test("active leases and existing backup destinations fail before modifying workspace data", async (t) => {
  const f = await fixture(t);
  await backupWorkspace(f.root, f.backup);
  const originalHash = await hashFile(path.join(f.root, "data", "app.db"));
  const backupHash = await hashFile(path.join(f.backup, "data", "app.db"));
  await assert.rejects(backupWorkspace(f.root, f.backup), /already exists/);
  assert.equal(await hashFile(path.join(f.backup, "data", "app.db")), backupHash);
  const lease = await acquireWorkspaceLock(f.root, "managed server");
  try {
    await assert.rejects(backupWorkspace(f.root, path.join(f.scratch, "blocked-backup")), /busy/);
    await assert.rejects(restoreWorkspace(f.root, f.backup), /busy/);
    assert.equal(await pathExists(path.join(f.scratch, "blocked-backup")), false);
    assert.equal(await hashFile(path.join(f.root, "data", "app.db")), originalHash);
  } finally { await lease.release(); }
  await assert.rejects(backupWorkspace(f.root, path.join(f.root, "nested-backup")), /outside/);
});

test("backup and restore reject artifact junctions without following or altering the external tree", async (t) => {
  const f = await fixture(t);
  await backupWorkspace(f.root, f.backup);
  const outside = path.join(f.scratch, "outside");
  await mkdir(outside); await writeFile(path.join(outside, "keep.docx"), "Do not touch");
  await rm(path.join(f.backup, "data", "resumes"), { recursive: true });
  await symlink(outside, path.join(f.backup, "data", "resumes"), "junction");
  const originalHash = await hashFile(path.join(f.root, "data", "app.db"));
  await assert.rejects(restoreWorkspace(f.root, f.backup), /symbolic link|junction/);
  assert.equal(await hashFile(path.join(f.root, "data", "app.db")), originalHash);
  await rm(path.join(f.root, "data", "resumes"), { recursive: true });
  await symlink(outside, path.join(f.root, "data", "resumes"), "junction");
  await assert.rejects(backupWorkspace(f.root, path.join(f.scratch, "unsafe-backup")), /symbolic link|junction/);
  assert.equal(await pathExists(path.join(f.scratch, "unsafe-backup")), false);
  assert.equal(await readFile(path.join(outside, "keep.docx"), "utf8"), "Do not touch");
});

test("failed data-bearing upgrade rolls back all changes and retains a recovery snapshot containing committed WAL rows", async (t) => {
  const f = await fixture(t);
  const migration = path.join(f.root, "prisma", "migrations", "99999999999999_scratch_failure");
  await mkdir(migration);
  await writeFile(path.join(migration, "migration.sql"), "ALTER TABLE Application ADD COLUMN futureOnly TEXT; UPDATE Application SET notes='Changed by failed upgrade'; CREATE UNIQUE INDEX Application_company_conflict ON Application(company);");
  const writer = new Database(path.join(f.root, "data", "app.db"));
  writer.pragma("journal_mode = WAL");
  writer.prepare("UPDATE Application SET company='WAL employer' WHERE id='application'").run();
  writer.prepare("INSERT INTO Application (id,company,role,source,lastStatusChangeAt,updatedAt) VALUES ('second','WAL employer','Engineer','manual',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  const lease = await acquireWorkspaceLock(f.root, "scratch schema upgrade");
  try {
    let failure;
    assert.throws(() => upgradeAndVerifyDatabase(f.root, path.join(f.root, "data", "app.db")), (error) => {
      failure = error;
      return error.code === "SQLITE_CONSTRAINT_UNIQUE";
    });
    assert.deepEqual(writer.prepare("SELECT id, company, notes FROM Application ORDER BY id").all(), [
      { id: "application", company: "WAL employer", notes: null },
      { id: "second", company: "WAL employer", notes: null },
    ]);
    const recovery = new Database(failure.backupPath, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(recovery.prepare("SELECT id, company, notes FROM Application ORDER BY id").all(), [
        { id: "application", company: "WAL employer", notes: null },
        { id: "second", company: "WAL employer", notes: null },
      ]);
    } finally { recovery.close(); }
  } finally { await lease.release(); writer.close(); }
});

test("custom configured databases are refused before backup or restore can modify canonical or external data", async (t) => {
  const f = await fixture(t);
  await backupWorkspace(f.root, f.backup);
  const originalHash = await hashFile(path.join(f.root, "data", "app.db"));
  const custom = path.join(f.scratch, "custom.db");
  await writeFile(custom, "External database must not be touched");
  const attempted = path.join(f.scratch, "wrong-database-backup");
  // An inherited canonical value must not silently mask a conflicting local
  // workspace declaration left by a prior developer/launcher session.
  await writeFile(path.join(f.root, ".env.local"), 'DATABASE_URL="file:./data/custom.db"');
  await assert.rejects(backupWorkspace(f.root, attempted));
  await assert.rejects(restoreWorkspace(f.root, f.backup));
  await writeFile(path.join(f.root, ".env.local"), 'DATABASE_URL="file:./data/app.db"');
  process.env.DATABASE_URL = `file:${custom}`;
  await assert.rejects(backupWorkspace(f.root, attempted));
  await assert.rejects(restoreWorkspace(f.root, f.backup));
  assert.equal(await pathExists(attempted), false);
  assert.equal(await hashFile(path.join(f.root, "data", "app.db")), originalHash);
  assert.equal(await readFile(custom, "utf8"), "External database must not be touched");
});
