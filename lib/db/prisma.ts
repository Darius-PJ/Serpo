import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/app.db";
  const adapter = new PrismaBetterSqlite3({
    url: `file:${path.resolve(process.cwd(), dbFile)}`,
  });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we don't open a new SQLite connection per request.
export const prisma = globalThis.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
