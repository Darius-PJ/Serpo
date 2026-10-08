import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { installWorkspace, uninstallWorkspace } from "../../scripts/installation.mjs";
import { acquireWorkspaceLock } from "../../scripts/workspaceLock.mjs";
import { hashFile, listTree, materializeNextBuildPackages, pathExists } from "../../scripts/workspacePaths.mjs";

async function fixture(t) {
  const scratch = await mkdtemp(path.join(tmpdir(), "serpo-install-test-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const sourceRoot = path.join(scratch, "release-source");
  const projectRoot = path.join(scratch, "installed");
  await mkdir(path.join(sourceRoot, "lib"), { recursive: true });
  await writeFile(path.join(sourceRoot, "package.json"), JSON.stringify({ name: "serpo", license: "AGPL-3.0-only" }));
  await writeFile(path.join(sourceRoot, "LICENSE"), "Scratch fixture license file");
  await writeFile(path.join(sourceRoot, ".node-version"), "24.18.0\n");
  await writeFile(path.join(sourceRoot, "app.js"), "Original app source");
  await writeFile(path.join(sourceRoot, "lib", "managed.js"), "Original library source");
  const prepareStage = async (stage) => {
    if (!(await pathExists(path.join(stage, "data")))) {
      await mkdir(path.join(stage, "data"));
      await writeFile(path.join(stage, "data", "app.db"), "Scratch database bytes");
    }
    if (!(await pathExists(path.join(stage, ".env.local")))) await writeFile(path.join(stage, ".env.local"), "PRIVATE_KEY=scratch-only");
  };
  await installWorkspace({ sourceRoot, projectRoot, prepareStage });
  return { scratch, sourceRoot, projectRoot, prepareStage };
}

async function snapshot(root) {
  const result = {};
  for (const relative of (await listTree(root)).files) {
    if (relative.startsWith(".serpo-workspace.lock/")) continue;
    result[relative] = await hashFile(path.join(root, ...relative.split("/")));
  }
  return result;
}

test("a real failed setup process mutating staged data leaves the entire prior app/data/config unchanged", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  await writeFile(path.join(f.sourceRoot, "app.js"), "New release source");
  await assert.rejects(installWorkspace({ ...f, prepareStage: async (stage) => {
    const result = spawnSync(process.execPath, ["-e", "const fs=require('node:fs');fs.writeFileSync('data/app.db','Failed migration bytes');fs.writeFileSync('.env.local','Changed staged config');process.exit(23)"], { cwd: stage, stdio: "pipe" });
    if (result.status !== 0) throw new Error(`Staged setup exited ${result.status}`);
  } }), /23/);
  assert.deepEqual(await snapshot(f.projectRoot), before);
  assert.equal(await pathExists(path.join(f.projectRoot, ".serpo-workspace.lock")), false);
});

test("successful staged upgrade keeps a recoverable prior app/data/config and preserves active user state", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.projectRoot, "data", "resume.docx"), "User résumé bytes");
  await writeFile(path.join(f.projectRoot, ".env.local"), "PRIVATE_KEY=preserve-owner-value");
  await writeFile(path.join(f.sourceRoot, "app.js"), "New release source");
  const result = await installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    await writeFile(path.join(stage, "data", "app.db"), "Successfully upgraded database bytes");
  } });
  assert.equal(await readFile(path.join(f.projectRoot, "app.js"), "utf8"), "New release source");
  assert.equal(await readFile(path.join(f.projectRoot, "data", "app.db"), "utf8"), "Successfully upgraded database bytes");
  assert.equal(await readFile(path.join(f.projectRoot, "data", "resume.docx"), "utf8"), "User résumé bytes");
  assert.equal(await readFile(path.join(f.projectRoot, ".env.local"), "utf8"), "PRIVATE_KEY=preserve-owner-value");
  assert.equal(await readFile(path.join(result.previousInstall, "app.js"), "utf8"), "Original app source");
  assert.equal(await readFile(path.join(result.previousInstall, "data", "app.db"), "utf8"), "Scratch database bytes");
  assert.equal(await readFile(path.join(result.previousInstall, ".env.local"), "utf8"), "PRIVATE_KEY=preserve-owner-value");
});

test("a real cutover rename collision rolls back prior app and data instead of leaving a half-upgrade", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  await mkdir(path.join(f.sourceRoot, "new-directory"));
  await writeFile(path.join(f.sourceRoot, "new-directory", "release.txt"), "New app file");
  await writeFile(path.join(f.sourceRoot, "app.js"), "New release source");
  await assert.rejects(installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    // Simulate an unmanaged external writer creating a destination while setup
    // runs: renaming over this non-empty directory must fail on every OS.
    await mkdir(path.join(f.projectRoot, "new-directory"));
    await writeFile(path.join(f.projectRoot, "new-directory", "owner.txt"), "Unrelated new file");
  } }));
  const after = await snapshot(f.projectRoot);
  delete after["new-directory/owner.txt"];
  assert.deepEqual(after, before);
  assert.equal(await readFile(path.join(f.projectRoot, "new-directory", "owner.txt"), "utf8"), "Unrelated new file");
});

test("default uninstall preserves data/config, edited and unrelated files, browser profiles and shared runtime", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.projectRoot, "app.js"), "Owner-edited source");
  await writeFile(path.join(f.projectRoot, "lib", "owner-notes.txt"), "Unrelated notes");
  await mkdir(path.join(f.projectRoot, "browser-profile"));
  await writeFile(path.join(f.projectRoot, "browser-profile", "cookies"), "Browser credentials");
  const shared = path.join(f.scratch, "shared-runtime");
  await mkdir(shared); await writeFile(path.join(shared, "node.exe"), "Do not delete shared runtime");
  const result = await uninstallWorkspace(f.projectRoot);
  assert.equal(await pathExists(path.join(f.projectRoot, "lib", "managed.js")), false);
  assert.equal(await readFile(path.join(f.projectRoot, "app.js"), "utf8"), "Owner-edited source");
  assert.equal(await readFile(path.join(f.projectRoot, "lib", "owner-notes.txt"), "utf8"), "Unrelated notes");
  assert.equal(await readFile(path.join(f.projectRoot, "data", "app.db"), "utf8"), "Scratch database bytes");
  assert.equal(await readFile(path.join(f.projectRoot, ".env.local"), "utf8"), "PRIVATE_KEY=scratch-only");
  assert.equal(await readFile(path.join(f.projectRoot, "browser-profile", "cookies"), "utf8"), "Browser credentials");
  assert.equal(await readFile(path.join(shared, "node.exe"), "utf8"), "Do not delete shared runtime");
  assert.ok(result.residuals.includes("lib/owner-notes.txt"));
  // The retained manifest permits a later clean reinstall into the same folder
  // without treating preserved user data as an unrelated installation.
  await installWorkspace({ ...f, prepareStage: f.prepareStage });
  assert.equal(await readFile(path.join(f.projectRoot, "data", "app.db"), "utf8"), "Scratch database bytes");
});

test("active managed leases refuse both upgrade and uninstall without touching app or data", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  const lease = await acquireWorkspaceLock(f.projectRoot, "managed app");
  try {
    await assert.rejects(installWorkspace({ ...f, prepareStage: f.prepareStage }), /busy/);
    await assert.rejects(uninstallWorkspace(f.projectRoot), /busy/);
    assert.deepEqual(await snapshot(f.projectRoot), before);
  } finally { await lease.release(); }
});

test("uninstall and upgrade refuse development checkouts and unmarked directories", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.projectRoot, ".git"), "gitdir: scratch-only-worktree");
  const before = await snapshot(f.projectRoot);
  await assert.rejects(uninstallWorkspace(f.projectRoot), /development checkout/);
  await assert.rejects(installWorkspace({ ...f, prepareStage: f.prepareStage }), /development checkout/);
  assert.deepEqual(await snapshot(f.projectRoot), before);
  const unrelated = path.join(f.scratch, "unrelated");
  await mkdir(unrelated); await writeFile(path.join(unrelated, "owner.txt"), "Unrelated user file");
  await assert.rejects(uninstallWorkspace(unrelated));
  await assert.rejects(installWorkspace({ sourceRoot: f.sourceRoot, projectRoot: unrelated, prepareStage: f.prepareStage }));
  assert.equal(await readFile(path.join(unrelated, "owner.txt"), "utf8"), "Unrelated user file");
});

test("malformed traversal manifests and junctions are rejected before any uninstall deletion", async (t) => {
  const f = await fixture(t);
  const marker = path.join(f.projectRoot, ".serpo-install.json");
  const original = await readFile(marker, "utf8");
  const manifest = JSON.parse(original);
  manifest.files[0].path = "../release-source/LICENSE";
  await writeFile(marker, JSON.stringify(manifest));
  const before = await snapshot(f.projectRoot);
  await assert.rejects(uninstallWorkspace(f.projectRoot), /Unsafe/);
  assert.deepEqual(await snapshot(f.projectRoot), before);
  await writeFile(marker, original);
  const outside = path.join(f.scratch, "outside");
  await mkdir(outside); await writeFile(path.join(outside, "keep.txt"), "Do not touch external files");
  await symlink(outside, path.join(f.projectRoot, "linked-directory"), "junction");
  await assert.rejects(uninstallWorkspace(f.projectRoot), /symbolic link|junction/);
  assert.equal(await readFile(path.join(f.projectRoot, "lib", "managed.js"), "utf8"), "Original library source");
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "Do not touch external files");
});

test("generated package junctions remain resolvable after staged installation moves and deletes their original targets", async (t) => {
  const f = await fixture(t);
  const aliasName = "native-fixture-0123456789abcdef";
  let originalTarget;
  await installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    originalTarget = path.join(stage, "node_modules", "native-fixture");
    const support = path.join(stage, "node_modules", "alias-support");
    const aliases = path.join(stage, ".next", "node_modules");
    await mkdir(originalTarget, { recursive: true });
    await mkdir(support);
    await mkdir(aliases, { recursive: true });
    await writeFile(path.join(originalTarget, "package.json"), JSON.stringify({ name: "native-fixture", main: "index.js" }));
    await writeFile(path.join(originalTarget, "index.js"), "module.exports = require('alias-support')");
    await writeFile(path.join(support, "package.json"), JSON.stringify({ name: "alias-support", main: "index.js" }));
    await writeFile(path.join(support, "index.js"), "module.exports = () => 'Module dependency survived relocation'");
    await symlink(originalTarget, path.join(aliases, aliasName), "junction");
  } });
  assert.equal(await pathExists(originalTarget), false, "the old absolute link target must actually be gone");
  await materializeNextBuildPackages(f.projectRoot); // Cached/setup use is idempotent.
  const requireInstalled = createRequire(path.join(f.projectRoot, "proof.cjs"));
  assert.equal(requireInstalled(`./.next/node_modules/${aliasName}`)(), "Module dependency survived relocation");
});

test("generated aliases cannot import an external directory, and failed cleanup does not strand the destination lease", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  const outside = path.join(f.scratch, "private-external");
  await mkdir(outside);
  await writeFile(path.join(outside, "package.json"), JSON.stringify({ name: "native-fixture" }));
  await writeFile(path.join(outside, "keep.txt"), "External user data");
  await assert.rejects(installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    await mkdir(path.join(stage, "node_modules"));
    const aliases = path.join(stage, ".next", "node_modules");
    await mkdir(aliases, { recursive: true });
    await symlink(outside, path.join(aliases, "native-fixture-0123456789abcdef"), "junction");
  } }));
  assert.deepEqual(await snapshot(f.projectRoot), before);
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "External user data");
  assert.equal(await pathExists(path.join(f.projectRoot, ".serpo-workspace.lock")), false);
  const nextLease = await acquireWorkspaceLock(f.projectRoot, "maintenance after refused stage");
  await nextLease.release();
});

test("a vetted generated package root still refuses nested user-data junctions", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  const outside = path.join(f.scratch, "private-nested");
  await mkdir(outside); await writeFile(path.join(outside, "keep.txt"), "Nested user data");
  await assert.rejects(installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    const dependency = path.join(stage, "node_modules", "native-fixture");
    const aliases = path.join(stage, ".next", "node_modules");
    await mkdir(dependency, { recursive: true });
    await mkdir(aliases, { recursive: true });
    await writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: "native-fixture" }));
    await symlink(outside, path.join(dependency, "user-profile"), "junction");
    await symlink(dependency, path.join(aliases, "native-fixture-0123456789abcdef"), "junction");
  } }));
  assert.deepEqual(await snapshot(f.projectRoot), before);
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "Nested user data");
  assert.equal(await pathExists(path.join(f.projectRoot, ".serpo-workspace.lock")), false);
});

test("an arbitrary staged data link is still refused while a completed setup's cleanup failure releases its lease", async (t) => {
  const f = await fixture(t);
  const before = await snapshot(f.projectRoot);
  const outside = path.join(f.scratch, "private-data");
  await mkdir(outside); await writeFile(path.join(outside, "keep.txt"), "Preserved private data");
  await assert.rejects(installWorkspace({ ...f, prepareStage: async (stage) => {
    await f.prepareStage(stage);
    await symlink(outside, path.join(stage, "data", "browser-profile"), "junction");
  } }));
  assert.deepEqual(await snapshot(f.projectRoot), before);
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "Preserved private data");
  assert.equal(await pathExists(path.join(f.projectRoot, ".serpo-workspace.lock")), false);
  const nextLease = await acquireWorkspaceLock(f.projectRoot, "next maintenance");
  await nextLease.release();
});
