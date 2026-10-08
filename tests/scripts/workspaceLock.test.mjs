import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { acquireWorkspaceLock } from "../../scripts/workspaceLock.mjs";

async function scratch(t) {
  const root = await mkdtemp(path.join(tmpdir(), "serpo-lease-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function leaseChild(t, root) {
  const moduleUrl = new URL("../../scripts/workspaceLock.mjs", import.meta.url).href;
  const code = `import { acquireWorkspaceLock } from ${JSON.stringify(moduleUrl)}; await acquireWorkspaceLock(${JSON.stringify(root)}, 'managed server'); console.log('locked'); setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close"); child.kill(); await closed;
    }
  });
  const [message] = await once(child.stdout, "data", { signal: AbortSignal.timeout(5000) });
  assert.match(String(message), /locked/);
  return child;
}

test("a separate managed process excludes maintenance, and its crash does not imply descendants are stopped", async (t) => {
  const root = await scratch(t);
  const child = await leaseChild(t, root);
  await assert.rejects(acquireWorkspaceLock(root, "restore"), /busy/);
  const ownerBefore = await readFile(path.join(root, ".serpo-workspace.lock", "owner.json"), "utf8");
  await assert.rejects(acquireWorkspaceLock(root, "upgrade"), /busy/);
  assert.equal(await readFile(path.join(root, ".serpo-workspace.lock", "owner.json"), "utf8"), ownerBefore);
  const closed = once(child, "close"); child.kill(); await closed;
  await assert.rejects(acquireWorkspaceLock(root, "restore after crash"), /Stale/);
  assert.equal(await readFile(path.join(root, ".serpo-workspace.lock", "owner.json"), "utf8"), ownerBefore);
  // This scratch-only process has no descendants. Simulate the owner's manual
  // review/removal, never a production automatic stale-state recovery.
  await rm(path.join(root, ".serpo-workspace.lock"), { recursive: true });
  const next = await acquireWorkspaceLock(root, "backup");
  await next.release();
});

test("incomplete or malformed lease state is refused, not guessed stale or deleted", async (t) => {
  const root = await scratch(t);
  const lock = path.join(root, ".serpo-workspace.lock");
  await mkdir(lock);
  await assert.rejects(acquireWorkspaceLock(root, "uninstall"), /Ambiguous/);
  const record = "{broken owner record";
  await writeFile(path.join(lock, "owner.json"), record);
  await assert.rejects(acquireWorkspaceLock(root, "uninstall"), /Ambiguous/);
  assert.equal(await readFile(path.join(lock, "owner.json"), "utf8"), record);
});
