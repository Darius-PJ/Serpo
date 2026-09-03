// One-command bootstrap: `npm run setup` (or `node scripts/setup.mjs`).
// Idempotent — each step checks whether its work is already done and skips it,
// so the Windows launcher can run this on every boot: a fresh clone installs
// everything, an up-to-date checkout passes through in seconds.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Next.js requires >= 20.9 (its engines field); everything else here is looser.
const [MIN_MAJOR, MIN_MINOR] = [20, 9];
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
  console.error(
    `Serpo needs Node.js ${MIN_MAJOR}.${MIN_MINOR} or newer; this is ${process.versions.node}.\n` +
      "Install the current LTS release from https://nodejs.org and run setup again.",
  );
  process.exit(1);
}

const mtime = (file) => (existsSync(file) ? statSync(file).mtimeMs : -1);

function run(title, command, args, extraEnv = {}) {
  console.log(`\n${title}...`);
  // One pre-joined string of static words: npm and npx are .cmd shims on
  // Windows that only a shell can start, and Node deprecates combining
  // shell:true with an args array (DEP0190).
  const result = spawnSync([command, ...args].join(" "), {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\n${title} failed (exit code ${result.status ?? "unknown"}); setup stopped.`);
    process.exit(result.status ?? 1);
  }
}

// npm packages. Staleness is judged by lockfile CONTENT (a hash this script
// stores after each successful install), never by file times — git operations
// rewrite mtimes without changing anything. `npm ci` runs only when there is
// no node_modules at all: it deletes the tree before installing, which must
// never happen underneath a running server. Every other drift is reconciled
// with plain `npm install`, which is safe to run at any time.
const lockfile = path.join(root, "package-lock.json");
if (!existsSync(lockfile)) {
  console.error("package-lock.json is missing — this is not a complete checkout of the repository.");
  process.exit(1);
}
const markerPath = path.join(root, "node_modules", ".serpo-setup");
const lockHash = () => createHash("sha256").update(readFileSync(lockfile)).digest("hex");
if (!existsSync(path.join(root, "node_modules"))) {
  run("Installing npm packages (a first run takes a few minutes)", "npm", ["ci"]);
  writeFileSync(markerPath, lockHash());
} else if (!existsSync(markerPath) || readFileSync(markerPath, "utf8") !== lockHash()) {
  run("Reconciling npm packages with package-lock.json", "npm", ["install", "--no-audit", "--no-fund"]);
  // Hashed after the install, which may itself have updated the lockfile.
  writeFileSync(markerPath, lockHash());
} else {
  console.log("npm packages: up to date.");
}

// Prisma client (generated/ is git-ignored). `prisma generate` copies the
// schema alongside its output, which dates the last generation.
if (mtime(path.join(root, "generated", "prisma", "schema.prisma")) < mtime(path.join(root, "prisma", "schema.prisma"))) {
  run("Generating the Prisma client", "npx", ["prisma", "generate"]);
} else {
  console.log("Prisma client: up to date.");
}

// Local config. Every key in the template is optional, so the copy just makes
// the file easy to find when an integration is wanted later.
if (!existsSync(path.join(root, ".env.local"))) {
  copyFileSync(path.join(root, ".env.example"), path.join(root, ".env.local"));
  console.log("Created .env.local from .env.example (all keys optional — see the comments in the file).");
} else {
  console.log(".env.local: present.");
}

// Database: create it from the committed migrations, or fail-closed verify and
// upgrade an existing one (dbUpgradeAndVerify backs it up first).
mkdirSync(path.join(root, "data"), { recursive: true });
if (existsSync(path.join(root, "data", "app.db"))) {
  run("Checking the database schema", "node", [path.join("scripts", "dbUpgradeAndVerify.mjs"), "data/app.db"]);
} else {
  run("Creating the local database", "npx", ["prisma", "migrate", "deploy"], {
    DATABASE_URL: "file:./data/app.db",
  });
}

console.log("\nSetup complete. Start the app with: npm run dev");
console.log("(Contributors running the e2e suite once need: npx playwright install)");
