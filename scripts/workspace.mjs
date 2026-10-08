import { lstat, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { acquireWorkspaceLock } from "./workspaceLock.mjs";
import { inspectDatabase, upgradeAndVerifyDatabase } from "./dbUpgradeAndVerify.mjs";
import { assertSafePath, copySafeFile, copyTree, hashFile, isWithin, listTree, pathExists, removeCreatedTree, validateRelativePath } from "./workspacePaths.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const FORMAT = "serpo-workspace-backup";
const MANIFEST = "manifest.json";
const OWNED_DATA = new Set(["app.db", "app.db-wal", "app.db-shm", "app.db-journal", "app.db.jobspy-state.json", "resumes", "raekwon-archive"]);
export const BACKUP_EXCLUSIONS = [".env.local and other credentials/config", "browser profiles and session cookies", "logs", "runtimes/dependencies", "existing database and recovery backups", "unrecognized data files"];

function includedFile(relative) {
  return relative === "data/app.db" || relative === "data/app.db.jobspy-state.json" || relative.startsWith("data/resumes/") || relative.startsWith("data/raekwon-archive/");
}

function portableResumePath(value, sourceRoot, portableOnly) {
  if (typeof value !== "string" || !value) throw new Error("Invalid stored résumé artifact path.");
  let relative;
  if (portableOnly) relative = validateRelativePath(value);
  else {
    const native = value.replace(/[\\/]/g, path.sep);
    if (!path.isAbsolute(native) && native.split(path.sep).includes("..")) throw new Error("Unsafe stored résumé artifact traversal.");
    const absolute = path.resolve(sourceRoot, native);
    if (!isWithin(sourceRoot, absolute)) throw new Error("Résumé artifact points outside this workspace; backup refused.");
    relative = validateRelativePath(path.relative(sourceRoot, absolute).split(path.sep).join("/"));
  }
  if (!/^data\/resumes\/(?:[a-z0-9]+\/)?[a-z0-9]+\.docx$/i.test(relative)) throw new Error("Résumé artifact is not an owned data/resumes DOCX path.");
  return relative;
}

function normalizeResumePaths(databasePath, sourceRoot, files, portableOnly = false) {
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    const hasResumePath = db.prepare("PRAGMA table_info('ApplyRun')").all().some((column) => column.name === "tailoredResumePath");
    const rows = hasResumePath ? db.prepare("SELECT id, tailoredResumePath FROM ApplyRun WHERE tailoredResumePath IS NOT NULL").all() : [];
    const updates = rows.map((row) => {
      const relative = portableResumePath(row.tailoredResumePath, sourceRoot, portableOnly);
      if (!files.has(relative)) throw new Error(`Referenced résumé artifact is missing from the backup: ${relative}`);
      return { id: row.id, relative };
    });
    if (rows.length) db.transaction(() => {
      const update = db.prepare("UPDATE ApplyRun SET tailoredResumePath=? WHERE id=?");
      for (const row of updates) update.run(row.relative, row.id);
    })();
    db.pragma("journal_mode = DELETE");
  } finally { db.close(); }
}

async function describeFiles(root) {
  const result = [];
  for (const relative of (await listTree(root)).files) {
    if (relative === MANIFEST) continue;
    const file = path.join(root, ...relative.split("/"));
    result.push({ path: relative, size: (await lstat(file)).size, sha256: await hashFile(file) });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

async function externalPath(projectRoot, value, mustExist) {
  const absolute = await assertSafePath(value, { allowMissing: !mustExist, directory: mustExist });
  if (isWithin(projectRoot, absolute) || isWithin(absolute, projectRoot)) throw new Error("Backup directories must be outside, and must not contain, the workspace root.");
  await assertSafePath(path.dirname(absolute), { directory: true });
  return absolute;
}

async function assertCanonicalDatabase(projectRoot) {
  const canonical = path.join(projectRoot, "data", "app.db");
  function check(value, origin) {
    if (value === undefined) return;
    const configured = typeof value === "string" && value ? path.resolve(projectRoot, value.replace(/^file:/, "")) : null;
    if (!configured || value.includes("$") || path.relative(canonical, configured) !== "") {
      throw new Error(`Workspace backup/restore supports only data/app.db. ${origin} declares an unsupported DATABASE_URL (custom paths, empty values and variable expansion are refused). Use a dedicated backup for that custom database; these commands have not modified either database.`);
    }
  }
  check(process.env.DATABASE_URL, "Inherited environment");
  // Maintenance can run outside Next and after either a production or dev
  // session. Reject conflicting declarations even if another source would
  // override them, rather than guess which workspace the user intends.
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"]) {
    const file = path.join(projectRoot, name);
    if (!(await pathExists(file))) continue;
    await assertSafePath(file);
    if (!(await lstat(file)).isFile()) throw new Error(`Configuration is not a regular file: ${name}`);
    check(parseEnv(await readFile(file, "utf8")).DATABASE_URL, name);
  }
}

export async function backupWorkspace(projectRoot, output) {
  projectRoot = await assertSafePath(projectRoot, { directory: true });
  output = await externalPath(projectRoot, output, false);
  if (await pathExists(output)) throw new Error(`Backup destination already exists: ${output}`);
  await assertCanonicalDatabase(projectRoot);
  const lease = await acquireWorkspaceLock(projectRoot, "workspace backup");
  let created = false;
  try {
    const dataRoot = path.join(projectRoot, "data");
    await listTree(dataRoot); // Reject junctions, device files and SQLite sidecar links before opening SQLite.
    const databasePath = path.join(dataRoot, "app.db");
    inspectDatabase(projectRoot, databasePath);
    await mkdir(output, { mode: 0o700 }); // Exclusive reservation: never overwrite an existing destination.
    created = true;
    await mkdir(path.join(output, "data"));
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try { await db.backup(path.join(output, "data", "app.db")); }
    finally { db.close(); }
    for (const name of ["resumes", "raekwon-archive"]) {
      if (await pathExists(path.join(dataRoot, name))) await copyTree(path.join(dataRoot, name), path.join(output, "data", name));
    }
    const cooldown = path.join(dataRoot, "app.db.jobspy-state.json");
    if (await pathExists(cooldown)) await copySafeFile(cooldown, path.join(output, "data", "app.db.jobspy-state.json"));
    const present = new Set((await listTree(output)).files);
    normalizeResumePaths(path.join(output, "data", "app.db"), projectRoot, present);
    const state = inspectDatabase(projectRoot, path.join(output, "data", "app.db"));
    const files = await describeFiles(output);
    const manifest = {
      format: FORMAT, version: 1, createdAt: new Date().toISOString(),
      schema: { sha256: createHash("sha256").update(state.schema).digest("hex"), migrations: state.migrationNames },
      files, exclusions: BACKUP_EXCLUSIONS,
    };
    // Published last: interrupted copies without a manifest cannot be restored.
    const serialized = JSON.stringify(manifest, null, 2) + "\n";
    if (files.length > 100000 || Buffer.byteLength(serialized) > 16 * 1024 * 1024) throw new Error("Backup exceeds the portable manifest limit.");
    await writeFile(path.join(output, MANIFEST), serialized, { flag: "wx", mode: 0o600 });
    return { output, files: files.length };
  } catch (error) {
    if (created) await removeCreatedTree(output);
    throw error;
  } finally { await lease.release(); }
}

async function validateBackup(projectRoot, input) {
  const tree = await listTree(input);
  const manifestFile = path.join(input, MANIFEST);
  if ((await lstat(manifestFile)).size > 16 * 1024 * 1024) throw new Error("Backup manifest is oversized.");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.format !== FORMAT || manifest.version !== 1 || !Array.isArray(manifest.files) ||
      !manifest.files.length || manifest.files.length > 100000 || !manifest.schema ||
      !/^[a-f0-9]{64}$/.test(manifest.schema.sha256) || !Array.isArray(manifest.schema.migrations)) throw new Error("Malformed or unsupported backup manifest.");
  const names = new Set();
  for (const entry of manifest.files) {
    const relative = validateRelativePath(entry.path);
    if (!includedFile(relative) || names.has(relative.toLowerCase()) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Malformed backup file entry: ${relative}`);
    names.add(relative.toLowerCase());
    const file = path.join(input, ...relative.split("/"));
    if ((await lstat(file)).size !== entry.size || await hashFile(file) !== entry.sha256) throw new Error(`Backup checksum mismatch: ${relative}`);
  }
  const declared = manifest.files.map((entry) => entry.path).sort();
  const actual = tree.files.filter((name) => name !== MANIFEST).sort();
  if (!names.has("data/app.db") || JSON.stringify(declared) !== JSON.stringify(actual)) throw new Error("Backup contains missing or unlisted files.");
  for (const directory of tree.directories) {
    if (directory !== "data" && directory !== "data/resumes" && directory !== "data/raekwon-archive" && !directory.startsWith("data/resumes/") && !directory.startsWith("data/raekwon-archive/")) throw new Error(`Unrecognized backup directory: ${directory}`);
  }
  const state = inspectDatabase(projectRoot, path.join(input, "data", "app.db"));
  if (createHash("sha256").update(state.schema).digest("hex") !== manifest.schema.sha256 || JSON.stringify(state.migrationNames) !== JSON.stringify(manifest.schema.migrations)) throw new Error("Backup schema metadata is incompatible or inconsistent.");
  return manifest;
}

export async function restoreWorkspace(projectRoot, input) {
  projectRoot = await assertSafePath(projectRoot, { directory: true });
  input = await externalPath(projectRoot, input, true);
  await assertCanonicalDatabase(projectRoot);
  const lease = await acquireWorkspaceLock(projectRoot, "workspace restore");
  let stage;
  let previousData;
  let movedPrevious = false;
  let installed = false;
  try {
    const manifest = await validateBackup(projectRoot, input);
    const dataRoot = path.join(projectRoot, "data");
    if (await pathExists(dataRoot)) await listTree(dataRoot);
    stage = await mkdtemp(path.join(projectRoot, ".serpo-restore-"));
    const stagedData = path.join(stage, "data");
    // Keep excluded/unknown local data (including migration backups). They are
    // never imported from a backup and never silently erased by a restore.
    if (await pathExists(dataRoot)) await copyTree(dataRoot, stagedData, { exclude: (name) => OWNED_DATA.has(name.split("/")[0]) });
    else await mkdir(stagedData);
    for (const directory of (await listTree(path.join(input, "data"))).directories) await mkdir(path.join(stagedData, ...directory.split("/")), { recursive: true });
    for (const entry of manifest.files) {
      const source = path.join(input, ...entry.path.split("/"));
      const destination = path.join(stage, ...entry.path.split("/"));
      await copySafeFile(source, destination);
      if ((await lstat(destination)).size !== entry.size || await hashFile(destination) !== entry.sha256) throw new Error(`Backup changed during staging: ${entry.path}`);
    }
    const stagedDatabase = path.join(stagedData, "app.db");
    normalizeResumePaths(stagedDatabase, projectRoot, new Set(manifest.files.map((entry) => entry.path)), true);
    // Older known checkpoints are upgraded only in staging. Ahead/drifted
    // schemas, corrupt pages, broken ledgers and FK violations fail pre-cutover.
    upgradeAndVerifyDatabase(projectRoot, stagedDatabase, { backup: false });
    inspectDatabase(projectRoot, stagedDatabase);
    await listTree(stagedData);
    await assertSafePath(dataRoot, { allowMissing: true });
    if (await pathExists(dataRoot)) {
      previousData = path.join(projectRoot, `data.pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`);
      await rename(dataRoot, previousData);
      movedPrevious = true;
    }
    try {
      await rename(stagedData, dataRoot);
      installed = true;
    } catch (error) {
      if (movedPrevious) {
        try { await rename(previousData, dataRoot); movedPrevious = false; }
        catch (rollback) { throw new Error(`Restore cutover failed and automatic rollback failed. Original data is retained at ${previousData}.`, { cause: new AggregateError([error, rollback]) }); }
      }
      throw error;
    }
    return { projectRoot, previousData: movedPrevious ? previousData : null };
  } finally {
    // Preserve evidence/staged data when rollback itself failed. Never delete
    // the retained pre-restore directory, on success or on failure.
    if (stage && (installed || !movedPrevious)) await removeCreatedTree(stage);
    await lease.release();
  }
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!["--root", "--output", "--input"].includes(key) || result[key] !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Usage: node scripts/workspace.mjs backup --output <new-directory> [--root <workspace>] | restore --input <backup-directory> [--root <workspace>]");
    result[key] = args[index + 1];
  }
  return result;
}

async function main() {
  const command = process.argv[2];
  const args = options(process.argv.slice(3));
  const root = path.resolve(args["--root"] ?? process.cwd());
  if (command === "backup" && args["--output"] && !args["--input"]) {
    const result = await backupWorkspace(root, path.resolve(args["--output"]));
    console.log(`Backup saved: ${result.output}\nIncludes data/app.db, résumé artifacts, report archives and JobSpy cooldown state.\nExcludes ${BACKUP_EXCLUSIONS.join("; ")}. Protect this directory: it contains personal data.`);
  } else if (command === "restore" && args["--input"] && !args["--output"]) {
    const result = await restoreWorkspace(root, path.resolve(args["--input"]));
    console.log(`Workspace restored. Credentials/browser profiles were not imported.\n${result.previousData ? `Pre-restore data retained: ${result.previousData}` : "No previous data directory existed."}`);
  } else throw new Error("Usage: npm run backup -- --output <new-directory> [--root <workspace>] | npm run restore -- --input <backup-directory> [--root <workspace>]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
