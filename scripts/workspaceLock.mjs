import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import path from "node:path";
import { assertSafePath, pathExists, removeCreatedTree } from "./workspacePaths.mjs";

const LOCK_NAME = ".serpo-workspace.lock";

async function readOwner(lock, projectRoot) {
  await assertSafePath(lock, { directory: true });
  const entries = await readdir(lock);
  if (entries.length !== 1 || entries[0] !== "owner.json") throw new Error("Unexpected workspace lease contents.");
  const file = path.join(lock, "owner.json");
  await assertSafePath(file);
  if ((await lstat(file)).size > 4096) throw new Error("Oversized workspace lease record.");
  const text = await readFile(file, "utf8");
  const owner = JSON.parse(text);
  if (owner.version !== 1 || !Number.isSafeInteger(owner.pid) || owner.pid < 1 ||
      owner.hostname !== hostname() || owner.projectRoot !== projectRoot ||
      typeof owner.token !== "string" || !/^[a-f0-9-]{36}$/.test(owner.token) ||
      typeof owner.purpose !== "string" || typeof owner.createdAt !== "string") {
    throw new Error("Unrecognized workspace lease record.");
  }
  return owner;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

// A directory creation is the cross-process exclusion primitive. Missing,
// foreign-host, malformed and permission-denied records are never guessed stale.
export async function acquireWorkspaceLock(projectRoot, purpose) {
  projectRoot = await assertSafePath(projectRoot, { directory: true });
  if (typeof purpose !== "string" || !purpose.trim() || purpose.length > 120) throw new Error("A workspace lease purpose is required.");
  const lock = path.join(projectRoot, LOCK_NAME);
  const reclaim = `${lock}.reclaim`;
  if (await pathExists(reclaim)) throw new Error(`Ambiguous workspace lease recovery: ${reclaim}. Review it manually before continuing.`);
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try { owner = await readOwner(lock, projectRoot); }
    catch (cause) { throw new Error(`Ambiguous workspace lease at ${lock}; maintenance refused.`, { cause }); }
    if (isAlive(owner.pid)) throw new Error(`Workspace is busy (${owner.purpose}, PID ${owner.pid}). Stop the managed app/setup before maintenance.`);
    // A dead parent can leave a live SQLite/Next/npm descendant. Never infer
    // safe maintenance solely from its PID: retain the lease for manual review.
    throw new Error(`Stale workspace lease (${owner.purpose}, PID ${owner.pid}) at ${lock}. Stop surviving owned/direct processes and review recovery data before manually removing this lease.`);
  }
  const token = randomUUID();
  try {
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({
      version: 1, pid: process.pid, hostname: hostname(), projectRoot,
      purpose, token, createdAt: new Date().toISOString(),
    }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    // Only this newly-created lease is ours. Never remove another lease.
    await removeCreatedTree(lock);
    throw error;
  }
  let released = false;
  return {
    release: async () => {
      if (released) return;
      const owner = await readOwner(lock, projectRoot);
      if (owner.token !== token || owner.pid !== process.pid) throw new Error("Workspace lease ownership changed; refusing to remove it.");
      await removeCreatedTree(lock);
      released = true;
    },
  };
}
