import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB_PATH = path.resolve(ROOT, "data", "test.db");

export default async function globalSetup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = TEST_DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }

  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:./data/test.db" },
    stdio: "inherit",
  });
}
