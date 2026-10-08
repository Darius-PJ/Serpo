// Bootstrap a checkout for the managed production app. Only a fully successful
// setup records a receipt; dependency installation never rewrites the lockfile.
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWorkspaceLock } from "./workspaceLock.mjs";
import { assertSupportedNode, OwnedProcessTreeError, stopOwnedProcess } from "./runtime.mjs";
import { materializeNextBuildPackages } from "./workspacePaths.mjs";
import { writeStartupProgress } from "./startupProgress.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = `${process.versions.node}:${process.platform}:${process.arch}`;
const dependencyFiles = ["package.json", "package-lock.json", ".node-version", ".npmrc"];
const environmentFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
const prismaFiles = ["prisma/schema.prisma", "prisma.config.ts", ...environmentFiles];
const dependencyOutputs = ["node_modules/next/dist/bin/next", "node_modules/prisma/build/index.js", "node_modules/better-sqlite3/package.json"];
const prismaOutputs = ["generated/prisma/schema.prisma", "generated/prisma/index.js", "generated/prisma/package.json"];
const buildOutputs = [".next/BUILD_ID", ".next/build-manifest.json", ".next/routes-manifest.json", ".next/prerender-manifest.json", ".next/required-server-files.json", ".next/server", ".next/static", ".next/node_modules"];

function hashFiles(root, files, extra = "") {
  const hash = createHash("sha256").update(extra);
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) { hash.update(JSON.stringify([relative, "missing"])); return; }
    if (statSync(absolute).isDirectory()) {
      hash.update(JSON.stringify([relative, "directory"]));
      for (const name of readdirSync(absolute).sort()) visit(`${relative}/${name}`);
    } else {
      const contents = readFileSync(absolute);
      hash.update(JSON.stringify([relative, contents.length]));
      hash.update(contents);
    }
  }
  for (const relative of [...new Set(files)].sort()) visit(relative);
  return hash.digest("hex");
}

function outputHash(root, files) {
  if (files.some((file) => !existsSync(path.join(root, file)))) return null;
  if (files.some((file) => {
    const absolute = path.join(root, file);
    return statSync(absolute).isDirectory() ? readdirSync(absolute).length === 0 : statSync(absolute).size === 0;
  })) return null;
  return hashFiles(root, files);
}

function buildInputHash(root, dependenciesHash, env) {
  const rootInputs = readdirSync(root).filter((name) =>
    /\.config\.(?:[cm]?[jt]s|json)$/.test(name) || /^(?:tsconfig|jsconfig)(?:\..+)?\.json$/.test(name) ||
    /^(?:instrumentation(?:-client)?|middleware|proxy)\.[jt]s$/.test(name) || /^\.(?:babelrc|browserslistrc)(?:\..+)?$/.test(name));
  // npm's invocation bookkeeping differs between `node scripts/setup.mjs` and
  // `npm run setup`; it is not application configuration. Everything else is
  // hashed, including inherited configuration and secrets, never serialized.
  const environment = Object.entries(env).filter(([key]) => !/^npm_/i.test(key) && !["INIT_CWD", "_"].includes(key)).sort(([a], [b]) => a.localeCompare(b));
  return hashFiles(root, ["app", "components", "lib", "public", "scripts", "prisma", "generated/prisma", ...dependencyFiles, ...environmentFiles, ...rootInputs], `${runtime}:${dependenciesHash}:${JSON.stringify(environment)}`);
}

function readReceipt(marker) {
  try {
    const value = JSON.parse(readFileSync(marker, "utf8"));
    return value?.version === 1 ? value : null;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function runCommand({ title, executable, args, cwd, env, signal }) {
  signal.throwIfAborted();
  console.log(`\n${title}...`);
  // npm is a .cmd shim on Windows. Only static words enter this shell; Node
  // CLIs use this runtime directly, including checkouts whose paths have spaces.
  const shell = process.platform === "win32" && executable === "npm";
  const child = shell
    ? spawn([executable, ...args].join(" "), { cwd, env, stdio: "inherit", shell: true, windowsHide: true })
    : spawn(executable, args, { cwd, env, stdio: "inherit", windowsHide: true, detached: process.platform !== "win32" });
  let stopping;
  const abort = () => {
    stopping = stopOwnedProcess(child);
    // Observe rejection while waiting for close, but keep the original result:
    // an unproved tree stop must reach the workspace lease owner.
    void stopping.catch((error) => console.error(error.message));
  };
  signal.addEventListener("abort", abort, { once: true });
  let failure;
  child.once("error", (error) => { failure = error; });
  try {
    const code = await new Promise((resolve) => child.once("close", resolve));
    if (stopping) await stopping;
    signal.throwIfAborted();
    if (failure) throw new Error(`${title} failed: ${failure.message}`, { cause: failure });
    if (code !== 0) throw new Error(`${title} failed (exit code ${code ?? "unknown"}); setup stopped.`);
  } finally { signal.removeEventListener("abort", abort); }
}

export async function setupWorkspace({ projectRoot = defaultRoot, runStep = runCommand,
  upgradeDatabase = async (root, database) => (await import("./dbUpgradeAndVerify.mjs")).upgradeAndVerifyDatabase(root, database),
  progressPath,
} = {}) {
  let phase = "setup";
  let detail = "Preparing setup";
  async function report(nextPhase, nextDetail) {
    phase = nextPhase;
    detail = nextDetail;
    await writeStartupProgress(progressPath, { state: "running", phase, detail });
  }
  async function reportFailure(error) {
    const reason = error instanceof Error ? error.message : String(error);
    await writeStartupProgress(progressPath, { state: "failed", phase, detail: `${detail} failed: ${reason}` });
  }
  await report(phase, detail);
  const root = path.resolve(projectRoot);
  let lease;
  try {
    assertSupportedNode();
    lease = await acquireWorkspaceLock(root, "setup");
  } catch (error) {
    await reportFailure(error);
    throw error;
  }
  const marker = path.join(root, "node_modules", ".serpo-setup");
  const temporaryMarker = `${marker}.${process.pid}.tmp`;
  let retainLease = false;
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("Setup interrupted; no successful setup was recorded."));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const productionEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: "file:./data/app.db" };
  async function step(title, executable, args, env = productionEnv) {
    controller.signal.throwIfAborted();
    await runStep({ title, executable, args, cwd: root, env, signal: controller.signal });
    controller.signal.throwIfAborted();
  }
  try {
    await report("dependencies", "Checking dependency cache");
    const previous = readReceipt(marker);
    rmSync(marker, { force: true });
    if (!existsSync(path.join(root, "package-lock.json"))) throw new Error("package-lock.json is missing; this is not a complete checkout.");
    const dependenciesHash = hashFiles(root, dependencyFiles, runtime);
    if (previous?.dependenciesHash !== dependenciesHash || !outputHash(root, dependencyOutputs)) {
      await report("dependencies", "Installing locked npm packages");
      await step("Installing locked npm packages", "npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], process.env);
      if (hashFiles(root, dependencyFiles, runtime) !== dependenciesHash) throw new Error("Dependency inputs changed during installation; run setup again with the committed lockfile.");
      if (!outputHash(root, dependencyOutputs)) throw new Error("Dependency installation did not produce the required runtime tools.");
    } else {
      console.log("npm packages: up to date.");
      await report("dependencies", "Using cached dependencies");
    }

    await report("environment", "Checking local environment");
    if (!existsSync(path.join(root, ".env.local"))) {
      await report("environment", "Creating local environment configuration");
      copyFileSync(path.join(root, ".env.example"), path.join(root, ".env.local"), constants.COPYFILE_EXCL);
      console.log("Created .env.local from .env.example (all integrations optional).");
    } else {
      console.log(".env.local: present.");
      await report("environment", "Using existing local environment configuration");
    }

    await report("prisma", "Checking Prisma client");
    const prismaHash = hashFiles(root, prismaFiles, dependenciesHash);
    let prismaArtifactsHash = outputHash(root, prismaOutputs) && hashFiles(root, ["generated/prisma"]);
    if (previous?.prismaHash !== prismaHash || !prismaArtifactsHash || previous.prismaArtifactsHash !== prismaArtifactsHash) {
      await report("prisma", "Generating Prisma client");
      await step("Generating the Prisma client", process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "generate", "--no-hints"]);
      prismaArtifactsHash = outputHash(root, prismaOutputs) && hashFiles(root, ["generated/prisma"]);
      if (!prismaArtifactsHash) throw new Error("Prisma generation did not produce a complete client.");
      if (hashFiles(root, prismaFiles, dependenciesHash) !== prismaHash) throw new Error("Prisma inputs changed during generation; run setup again.");
    } else {
      console.log("Prisma client: up to date.");
      await report("prisma", "Using cached Prisma client");
    }

    await report("database", "Checking local database");
    mkdirSync(path.join(root, "data"), { recursive: true });
    const database = path.join(root, "data", "app.db");
    if (!existsSync(database)) {
      await report("database", "Creating local database");
      await step("Creating the local database", process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    }
    // Imported only after npm ci: fresh checkouts do not yet have SQLite's
    // native module. The exported helper uses our already-held lease.
    controller.signal.throwIfAborted();
    await report("database", "Verifying and upgrading local database");
    const upgraded = await upgradeDatabase(root, database);
    if (upgraded?.backupPath) console.log(`Database upgraded and verified. Backup: ${path.basename(upgraded.backupPath)}`);
    else console.log("Database schema verified.");
    controller.signal.throwIfAborted();

    await report("build", "Checking production build");
    const buildHash = buildInputHash(root, dependenciesHash, productionEnv);
    await materializeNextBuildPackages(root);
    let buildArtifactsHash = outputHash(root, buildOutputs);
    if (previous?.buildHash !== buildHash || !buildArtifactsHash || previous.buildArtifactsHash !== buildArtifactsHash) {
      await report("build", "Building production app");
      await step("Building the production app", process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"]);
      await materializeNextBuildPackages(root);
      buildArtifactsHash = outputHash(root, buildOutputs);
      if (!buildArtifactsHash) throw new Error("Production build did not produce a complete runnable output.");
      if (buildInputHash(root, dependenciesHash, productionEnv) !== buildHash) throw new Error("Source or configuration changed during the build; run setup again.");
    } else {
      console.log("Production build: up to date.");
      await report("build", "Using cached production build");
    }

    controller.signal.throwIfAborted();
    writeFileSync(temporaryMarker, JSON.stringify({ version: 1, dependenciesHash, prismaHash, prismaArtifactsHash, buildHash, buildArtifactsHash }), { mode: 0o600, flag: "wx" });
    renameSync(temporaryMarker, marker);
  } catch (error) {
    await reportFailure(error);
    if (error instanceof OwnedProcessTreeError) {
      retainLease = true;
      throw new Error(`Setup cannot confirm descendant shutdown. Workspace lease retained at ${path.join(root, ".serpo-workspace.lock")}. Stop surviving setup/npm/Prisma and direct workspace processes, review recovery data, then manually remove this lease only when the workspace is no longer in use.`, { cause: error });
    }
    throw error;
  } finally {
    try {
      try { rmSync(temporaryMarker, { force: true }); }
      finally { if (!retainLease) await lease.release(); }
    } catch (error) {
      await reportFailure(error);
      rmSync(marker, { force: true });
      throw error;
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  if (controller.signal.aborted) {
    rmSync(marker, { force: true });
    await reportFailure(controller.signal.reason);
    controller.signal.throwIfAborted();
  }
  await report("setup", "Setup complete");
  console.log("\nSetup complete. Managed app: node scripts/serpoHost.mjs 3000");
  console.log("Contributors may use npm run dev. For e2e, install Chromium with npx playwright install.");
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const progressIndex = args.indexOf("--progress-path");
  const progressPath = progressIndex === -1 ? undefined : args[progressIndex + 1];
  try {
    if (progressIndex !== -1 && (!progressPath || !path.isAbsolute(progressPath) || args.indexOf("--progress-path", progressIndex + 1) !== -1)) {
      throw new Error("--progress-path requires one absolute file path.");
    }
    await setupWorkspace({ progressPath });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
