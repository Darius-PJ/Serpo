import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWorkspaceLock } from "./workspaceLock.mjs";
import { stopOwnedProcess } from "./runtime.mjs";
import { assertSafePath, copySafeFile, copyTree, hashFile, isWithin, listTree, materializeNextBuildPackages, pathExists, removeCreatedTree, validateRelativePath } from "./workspacePaths.mjs";

const MARKER = ".serpo-install.json";
const LEASE = ".serpo-workspace.lock";
const PRIVATE_ROOTS = new Set(["data", ".env.local", ".venv-jobspy", "browser-profile", "serpo"]);

function protectedPath(relative) {
  const first = relative.split("/")[0].toLowerCase();
  return PRIVATE_ROOTS.has(first) || first.startsWith(".serpo-workspace.lock") || first.startsWith("data.pre-restore-") || (first.startsWith(".env") && first !== ".env.example");
}

async function readManagedInstall(projectRoot) {
  if (await pathExists(path.join(projectRoot, ".git"))) throw new Error("Refusing a development checkout; installer/uninstaller only manage marked installed copies.");
  const marker = path.join(projectRoot, MARKER);
  if (!(await pathExists(marker))) throw new Error("Refusing an unmarked directory; move legacy installs aside or choose a new installation path. No unrelated files were removed.");
  await assertSafePath(marker);
  if ((await lstat(marker)).size > 64 * 1024 * 1024) throw new Error("Managed-install manifest is oversized.");
  const record = JSON.parse(await readFile(marker, "utf8"));
  if (record.format !== "serpo-managed-install" || record.version !== 1 || record.projectRoot !== projectRoot || !Array.isArray(record.files) || record.files.length > 100000 || !Array.isArray(record.directories) || record.directories.length > 100000) throw new Error("This is not a recognized managed Serpo install; unrelated/unmarked directories are refused.");
  const seen = new Set();
  for (const entry of record.files) {
    const relative = validateRelativePath(entry.path);
    if (relative === MARKER || protectedPath(relative) || seen.has(relative.toLowerCase()) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Unsafe managed-install manifest.");
    seen.add(relative.toLowerCase());
  }
  for (const directory of record.directories) {
    validateRelativePath(directory);
    if (protectedPath(directory)) throw new Error("Unsafe managed-install directory manifest.");
  }
  return record;
}

async function describeInstall(stage, projectRoot) {
  const tree = await listTree(stage);
  const files = [];
  for (const relative of tree.files) {
    if (protectedPath(relative) || relative === MARKER) continue;
    const file = path.join(stage, ...relative.split("/"));
    files.push({ path: relative, size: (await lstat(file)).size, sha256: await hashFile(file) });
  }
  if (files.length > 100000) throw new Error("Staged installation exceeds the managed file limit.");
  return {
    format: "serpo-managed-install", version: 1, projectRoot, createdAt: new Date().toISOString(),
    files, directories: tree.directories.filter((relative) => !protectedPath(relative)),
  };
}

async function prepareProductionStage(stage) {
  const child = spawn(process.execPath, [path.join(stage, "scripts", "setup.mjs")], {
    cwd: stage, stdio: "inherit", windowsHide: true, detached: process.platform !== "win32",
    env: { ...process.env, DATABASE_URL: "file:./data/app.db" },
  });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const deadline = Promise.withResolvers();
  let stopping;
  const timer = setTimeout(async () => {
    const stopDeadline = Promise.withResolvers();
    const stopTimer = setTimeout(() => {
      const error = new Error("Timed-out staged setup could not be stopped within 10 seconds; staging and destination lease require manual review.");
      error.preserveStage = true;
      child.unref();
      stopDeadline.reject(error);
    }, 10000);
    stopping = Promise.race([stopOwnedProcess(child), stopDeadline.promise]);
    try {
      await stopping;
      deadline.reject(new Error("Staged setup exceeded its 30-minute deadline; prior installation was not replaced."));
    } catch (error) {
      error.preserveStage = true;
      child.unref();
      deadline.reject(error);
    } finally { clearTimeout(stopTimer); }
  }, 30 * 60 * 1000);
  try {
    const status = await Promise.race([closed, deadline.promise]);
    if (stopping) {
      await stopping;
      throw new Error("Staged setup exceeded its 30-minute deadline; prior installation was not replaced.");
    }
    if (status.code !== 0) throw new Error(`Staged setup failed (exit ${status.code ?? status.signal}); the prior installation has not been replaced.`);
  } finally { clearTimeout(timer); }
}

// Preparation is an internal seam for destructive-edge tests; the public CLI
// always runs the real production setup. No live files are changed before it
// succeeds. The destination root and its lease remain in place during cutover.
export async function installWorkspace({ sourceRoot, projectRoot, prepareStage = prepareProductionStage }) {
  sourceRoot = await assertSafePath(sourceRoot, { directory: true });
  projectRoot = await assertSafePath(projectRoot, { allowMissing: true });
  if (isWithin(sourceRoot, projectRoot) || isWithin(projectRoot, sourceRoot)) throw new Error("Install source and destination must be separate trees.");
  await assertSafePath(path.dirname(projectRoot), { directory: true });
  await listTree(sourceRoot);
  const pkg = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  if (pkg.name !== "serpo" || pkg.license !== "AGPL-3.0-only" || !(await pathExists(path.join(sourceRoot, "LICENSE")))) throw new Error("Incomplete Serpo source/license payload.");
  let createdRoot = false;
  if (!(await pathExists(projectRoot))) { await mkdir(projectRoot); createdRoot = true; }
  const lease = await acquireWorkspaceLock(projectRoot, "install/upgrade");
  let stage;
  let previousInstall;
  let cutoverStarted = false;
  let rollbackFailed = false;
  let preserveStage = false;
  const movedOld = [];
  const movedNew = [];
  try {
    const existing = (await readdir(projectRoot)).filter((name) => name !== LEASE);
    if (existing.length) {
      await readManagedInstall(projectRoot);
      await materializeNextBuildPackages(projectRoot);
    }
    else if (!createdRoot) throw new Error("Refusing an existing unmarked destination, even when empty. Choose a new install directory.");
    await listTree(projectRoot);
    stage = await mkdtemp(path.join(path.dirname(projectRoot), ".serpo-install-stage-"));
    const appStage = path.join(stage, "app");
    await copyTree(sourceRoot, appStage, { exclude: (relative) => {
      const first = relative.split("/")[0].toLowerCase();
      return protectedPath(relative) || [".git", "node_modules", ".next", "generated", "dist", MARKER].includes(first);
    } });
    if (await pathExists(path.join(projectRoot, "data"))) await copyTree(path.join(projectRoot, "data"), path.join(appStage, "data"));
    if (await pathExists(path.join(projectRoot, ".env.local"))) await copySafeFile(path.join(projectRoot, ".env.local"), path.join(appStage, ".env.local"));
    if (await pathExists(path.join(projectRoot, ".venv-jobspy"))) await copyTree(path.join(projectRoot, ".venv-jobspy"), path.join(appStage, ".venv-jobspy"));
    await prepareStage(appStage);
    if (await pathExists(path.join(appStage, LEASE))) throw new Error("Staged setup left an active/ambiguous lease; cutover refused.");
    await materializeNextBuildPackages(appStage);
    const record = await describeInstall(appStage, projectRoot);
    await writeFile(path.join(appStage, MARKER), JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await listTree(projectRoot);
    await listTree(appStage);
    if (existing.length) {
      previousInstall = path.join(path.dirname(projectRoot), `.serpo-before-upgrade-${path.basename(projectRoot)}-${randomUUID()}`);
      await mkdir(previousInstall, { mode: 0o700 });
    }
    cutoverStarted = true;
    try {
      for (const name of existing) {
        await rename(path.join(projectRoot, name), path.join(previousInstall, name));
        movedOld.push(name);
      }
      for (const name of await readdir(appStage)) {
        await rename(path.join(appStage, name), path.join(projectRoot, name));
        movedNew.push(name);
      }
    } catch (error) {
      try {
        for (const name of [...movedNew].reverse()) await rename(path.join(projectRoot, name), path.join(appStage, name));
        for (const name of [...movedOld].reverse()) await rename(path.join(previousInstall, name), path.join(projectRoot, name));
      } catch (rollback) {
        rollbackFailed = true;
        throw new Error(`Install cutover and automatic rollback failed. Retained prior files: ${previousInstall ?? projectRoot}; staged files: ${stage}. Stop and recover these directories manually.`, { cause: new AggregateError([error, rollback]) });
      }
      throw error;
    }
    return { projectRoot, previousInstall: previousInstall ?? null };
  } catch (error) {
    preserveStage = Boolean(error.preserveStage);
    throw error;
  } finally {
    // A failed preparation leaves the prior app/data/config byte-for-byte in
    // place. Failed rollback evidence and all successful prior installs stay.
    try {
      if (stage && !rollbackFailed) {
        try {
          if (await pathExists(path.join(stage, "app", LEASE))) preserveStage = true;
        } catch (error) { preserveStage = true; throw error; }
        if (preserveStage) console.error(`Staged setup could not be proved stopped; files retained for manual review: ${stage}`);
        else {
          try { await removeCreatedTree(stage); }
          catch (error) { console.error(`Staging cleanup refused/failed; files retained at ${stage}: ${error.message}`); }
        }
      }
      if (previousInstall && !rollbackFailed && !(await readdir(previousInstall)).length) await rmdir(previousInstall);
    } finally {
      // Housekeeping failure must not strand an otherwise releasable lease.
      // An unproved shutdown or failed rollback still deliberately retains it.
      if (rollbackFailed || preserveStage) console.error(`Destination maintenance lease retained for manual recovery: ${path.join(projectRoot, LEASE)}`);
      else {
        await lease.release();
        if (createdRoot && !cutoverStarted && !(await readdir(projectRoot)).length) await rmdir(projectRoot);
      }
    }
  }
}

export async function uninstallWorkspace(projectRoot) {
  projectRoot = await assertSafePath(projectRoot, { directory: true });
  const lease = await acquireWorkspaceLock(projectRoot, "uninstall");
  try {
    const record = await readManagedInstall(projectRoot);
    await materializeNextBuildPackages(projectRoot);
    await listTree(projectRoot); // Refuse any junction/symlink before deleting anything.
    const removable = [];
    const preservedManaged = [];
    for (const entry of record.files) {
      const file = path.join(projectRoot, ...entry.path.split("/"));
      if (!(await pathExists(file))) continue;
      if ((await lstat(file)).isFile() && (await lstat(file)).size === entry.size && await hashFile(file) === entry.sha256) removable.push(file);
      else preservedManaged.push(entry);
    }
    // Delete only manifest-listed, unchanged regular files. Unknown or edited
    // files and all data/config/browser/shared-runtime roots are preserved.
    for (const file of removable) { await assertSafePath(file); await unlink(file); }
    for (const relative of [...new Set(record.directories)].sort((a, b) => b.split("/").length - a.split("/").length)) {
      const directory = path.join(projectRoot, ...relative.split("/"));
      if (!(await pathExists(directory))) continue;
      await assertSafePath(directory, { directory: true });
      try { await rmdir(directory); }
      catch (error) { if (!["ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
    }
    await writeFile(path.join(projectRoot, MARKER), JSON.stringify({ ...record, files: preservedManaged, uninstalledAt: new Date().toISOString() }, null, 2) + "\n", { mode: 0o600 });
    const residuals = (await listTree(projectRoot)).files.filter((relative) => !relative.startsWith(`${LEASE}/`));
    const emptyDirectories = (await listTree(projectRoot)).directories.filter((relative) => relative !== LEASE);
    return { projectRoot, removed: removable.length, residuals, directories: emptyDirectories };
  } finally { await lease.release(); }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!["--source", "--root"].includes(args[index]) || values[args[index]] || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid installation arguments.");
    values[args[index]] = args[index + 1];
  }
  if (command === "install" && values["--source"] && values["--root"]) {
    const result = await installWorkspace({ sourceRoot: values["--source"], projectRoot: values["--root"] });
    console.log(`Installed: ${result.projectRoot}\n${result.previousInstall ? `Prior app/data/config retained: ${result.previousInstall}` : "New managed installation created."}`);
  } else if (command === "uninstall" && values["--root"] && !values["--source"]) {
    const result = await uninstallWorkspace(values["--root"]);
    console.log(`Removed ${result.removed} unchanged managed files. Preserved user data/config and all shared browser/runtime state.\nResidual files:\n${result.residuals.map((relative) => `  ${relative}`).join("\n")}\nResidual directories:\n${result.directories.map((relative) => `  ${relative}`).join("\n")}`);
  } else throw new Error("Usage: node scripts/installation.mjs install --source <source-tree> --root <new-or-managed-install> | uninstall --root <managed-install>");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
