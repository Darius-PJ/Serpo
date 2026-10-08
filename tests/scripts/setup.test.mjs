import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setupWorkspace } from "../../scripts/setup.mjs";
import { acquireWorkspaceLock } from "../../scripts/workspaceLock.mjs";
import { OwnedProcessTreeError } from "../../scripts/runtime.mjs";

const Database = createRequire(import.meta.url)("better-sqlite3");
const migration = "CREATE TABLE Records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "serpo-setup-test-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  async function put(relative, contents) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), contents);
  }
  await put("package.json", JSON.stringify({ name: "setup-fixture", version: "1.0.0" }));
  await put("package-lock.json", JSON.stringify({ name: "setup-fixture", lockfileVersion: 3, packages: {} }));
  await put(".node-version", "24.18.0\n");
  await put(".env.example", "DATABASE_URL=file:./data/app.db\nANTHROPIC_API_KEY=fixture-secret-one\n");
  await put("app/page.tsx", "export default function Page() { return <h1>Release one</h1>; }\n");
  await put("next.config.ts", "export default {};\n");
  await put("prisma/schema.prisma", "datasource db { provider = \"sqlite\" }\n");
  await put("prisma/migrations/0001_records/migration.sql", migration);
  const f = { root, put, failBuild: false };
  // Stand-ins for the external install/generation/compiler tools. The cache,
  // filesystem receipt, real SQLite verification, and cross-process lease are
  // production code. Every build emits a distinct generation, as Next does.
  f.runStep = async ({ executable, args }) => {
    if (executable === "npm") {
      if (args[0] !== "ci") throw new Error("Fixture refuses an unlocked dependency installation.");
      await rm(path.join(root, "node_modules"), { recursive: true, force: true });
      await put("node_modules/next/dist/bin/next", "fixture-next");
      await put("node_modules/prisma/build/index.js", "fixture-prisma");
      await put("node_modules/better-sqlite3/package.json", "{}");
    } else if (args[1] === "generate") {
      await put("generated/prisma/schema.prisma", await readFile(path.join(root, "prisma/schema.prisma")));
      await put("generated/prisma/index.js", "module.exports = {};\n");
      await put("generated/prisma/package.json", "{}");
    } else if (args.at(-1) === "deploy") {
      const db = new Database(path.join(root, "data", "app.db"));
      try {
        db.exec(migration);
        db.exec("CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, finished_at DATETIME, migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_steps_count INTEGER NOT NULL DEFAULT 0)");
        db.prepare("INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)").run(randomUUID(), createHash("sha256").update(migration).digest("hex"), "0001_records");
      } finally { db.close(); }
    } else if (args.at(-1) === "build") {
      await put(".next/BUILD_ID", f.failBuild ? "partial-build" : randomUUID());
      if (f.failBuild) throw new Error("build failed after partial output");
      for (const file of ["build-manifest.json", "routes-manifest.json", "prerender-manifest.json", "required-server-files.json"]) await put(`.next/${file}`, "{}");
      await put(".next/server/app/page.js", "fixture-server-output");
      await put(".next/static/app.js", "fixture-browser-output");
      await put(".next/node_modules/better-sqlite3-0123456789abcdef/package.json", JSON.stringify({ name: "better-sqlite3" }));
      await put(".next/node_modules/better-sqlite3-0123456789abcdef/build/Release/better_sqlite3.node", "fixture-native-output");
      await put(".next/node_modules/playwright-fedcba9876543210/package.json", JSON.stringify({ name: "playwright" }));
      await put(".next/node_modules/playwright-fedcba9876543210/index.js", "fixture-playwright-output");
    } else throw new Error("Unexpected setup step in fixture.");
  };
  f.setup = (progressPath, runStep = f.runStep) => setupWorkspace({ projectRoot: root, runStep, progressPath });
  f.buildId = () => readFile(path.join(root, ".next", "BUILD_ID"), "utf8");
  f.receipt = () => readFile(path.join(root, "node_modules", ".serpo-setup"), "utf8");
  return f;
}

async function assertMaintenanceAvailable(root) {
  const lease = await acquireWorkspaceLock(root, "backup");
  await lease.release();
}

async function withDatabase(root, operation) {
  const db = new Database(path.join(root, "data", "app.db"));
  try { return operation(db); } finally { db.close(); }
}

test("unchanged setup reuses production, but source content and local configuration invalidate it", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const original = await f.buildId();
  await f.setup();
  assert.equal(await f.buildId(), original);

  const source = path.join(f.root, "app", "page.tsx");
  const before = await stat(source);
  await f.put("app/page.tsx", "export default function Page() { return <h1>Release two</h1>; }\n");
  await utimes(source, before.atime, before.mtime);
  await f.setup();
  const sourceBuild = await f.buildId();
  assert.notEqual(sourceBuild, original);

  await f.put("next.config.ts", "export default { poweredByHeader: false };\n");
  await f.setup();
  const configBuild = await f.buildId();
  assert.notEqual(configBuild, sourceBuild);

  const secret = "rotated-private-fixture-secret";
  await f.put(".env.local", `DATABASE_URL=file:./data/app.db\nANTHROPIC_API_KEY=${secret}\n`);
  await f.setup();
  const environmentBuild = await f.buildId();
  assert.notEqual(environmentBuild, configBuild);
  assert.equal((await f.receipt()).includes(secret), false);
  await f.setup();
  assert.equal(await f.buildId(), environmentBuild);
});
test("progress paths stay outside the production cache and setup reports its real failure", async (t) => {
  const f = await fixture(t);
  const progressRoot = await mkdtemp(path.join(tmpdir(), "serpo-progress-test-"));
  t.after(() => rm(progressRoot, { recursive: true, force: true }));
  const firstProgress = path.join(progressRoot, "first.json");
  const secondProgress = path.join(progressRoot, "second.json");

  await f.setup(firstProgress);
  let commandCount = 0;
  await f.setup(secondProgress, async (step) => {
    commandCount += 1;
    await f.runStep(step);
  });
  assert.equal(commandCount, 0);
  assert.equal(JSON.parse(await readFile(secondProgress, "utf8")).state, "running");

  await f.put("app/page.tsx", "export default function Page() { return <h1>Broken build</h1>; }\n");
  f.failBuild = true;
  await assert.rejects(f.setup(secondProgress), /build failed after partial output/);
  const failure = JSON.parse(await readFile(secondProgress, "utf8"));
  assert.equal(failure.state, "failed");
  assert.equal(failure.phase, "build");
  assert.match(failure.detail, /build failed after partial output/);
});


test("lockfile and runtime-pin changes invalidate the production cache", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const original = await f.buildId();
  const lock = JSON.stringify({ name: "setup-fixture", lockfileVersion: 3, packages: {}, fixtureRevision: 2 });
  await f.put("package-lock.json", lock);
  await f.setup();
  const lockBuild = await f.buildId();
  assert.notEqual(lockBuild, original);

  await f.put(".node-version", "24.18.1\n");
  await f.setup();
  assert.notEqual(await f.buildId(), lockBuild);
});

test("partial build failure records no success, releases maintenance, and cannot be reused on retry", async (t) => {
  const f = await fixture(t);
  await f.setup();
  await withDatabase(f.root, (db) => db.prepare("INSERT INTO Records (value) VALUES (?)").run("keep this record"));
  await f.put("app/page.tsx", "export default function Page() { return <h1>Changed</h1>; }\n");
  f.failBuild = true;
  await assert.rejects(f.setup(f.root), /build failed after partial output/);
  await assert.rejects(f.receipt(), { code: "ENOENT" });
  await assertMaintenanceAvailable(f.root);
  assert.equal(await withDatabase(f.root, (db) => db.prepare("SELECT value FROM Records").get().value), "keep this record");
  f.failBuild = false;
  await f.setup();
  assert.notEqual(await f.buildId(), "partial-build");
  assert.equal(await withDatabase(f.root, (db) => db.prepare("SELECT value FROM Records").get().value), "keep this record");
  await assertMaintenanceAvailable(f.root);
});

test("an existing drifted database stops setup without replacing records or blessing old production output", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const original = await f.buildId();
  await withDatabase(f.root, (db) => {
    db.prepare("INSERT INTO Records (value) VALUES (?)").run("preserve on drift");
    db.exec("ALTER TABLE Records ADD COLUMN unexpected TEXT");
  });
  await f.put("app/page.tsx", "export default function Page() { return <h1>Unbuilt change</h1>; }\n");
  await assert.rejects(f.setup());
  assert.equal(await f.buildId(), original);
  await assert.rejects(f.receipt(), { code: "ENOENT" });
  assert.equal(await withDatabase(f.root, (db) => db.prepare("SELECT value FROM Records").get().value), "preserve on drift");
  await assertMaintenanceAvailable(f.root);
});

test("an incomplete production tree is rebuilt even when BUILD_ID survives", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const original = await f.buildId();
  await rm(path.join(f.root, ".next", "server"), { recursive: true });
  await f.setup();
  assert.notEqual(await f.buildId(), original);
});

test("native runtime alias loss or corruption invalidates production while other outputs remain intact", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const original = await f.buildId();
  const alias = path.join(f.root, ".next", "node_modules", "better-sqlite3-0123456789abcdef");
  const binding = path.join(alias, "build", "Release", "better_sqlite3.node");
  const compiledBinding = await readFile(binding);
  await rm(alias, { recursive: true });
  await f.setup();
  const repaired = await f.buildId();
  assert.notEqual(repaired, original);
  assert.deepEqual(await readFile(binding), compiledBinding);

  await writeFile(binding, "corrupted native output");
  await f.setup();
  assert.notEqual(await f.buildId(), repaired);
  assert.deepEqual(await readFile(binding), compiledBinding);
});

test("unconfirmed command-tree shutdown records no success and retains maintenance exclusion", async (t) => {
  const f = await fixture(t);
  await f.setup();
  await f.put("app/page.tsx", "export default function Page() { return <h1>Interrupted rebuild</h1>; }\n");
  await assert.rejects(setupWorkspace({ projectRoot: f.root, runStep: async (step) => {
    if (step.args.at(-1) === "build") throw new OwnedProcessTreeError("Descendant shutdown was not established.");
    await f.runStep(step);
  } }));
  await assert.rejects(f.receipt(), { code: "ENOENT" });
  await assert.rejects(acquireWorkspaceLock(f.root, "restore"));
  // There is no real descendant in this command-boundary fixture. Its root
  // cleanup deliberately represents manual recovery, not automatic unlock.
});
