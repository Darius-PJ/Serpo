import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { migrateTestDatabase } from "./migrateTestDatabase";

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_DB_PATH = path.resolve(ROOT, "data", "test.db");

export default async function globalSetup() {
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = TEST_DB_PATH + suffix;
    if (existsSync(p)) rmSync(p);
  }

  // Prisma's schema engine currently fails without diagnostic output in this
  // Windows/Node environment. Apply the version-controlled SQL through the
  // same SQLite driver used at runtime so DB-backed tests can still validate
  // the real schema and each migration. See migrateTestDatabase for errors
  // that identify the exact migration when SQL is invalid.
  migrateTestDatabase(ROOT, TEST_DB_PATH);
}
