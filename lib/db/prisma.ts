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

// One client per process, kept on globalThis: dev hot reloads would otherwise
// open a new SQLite connection per reload, and the automation ticker started
// from instrumentation.ts loads in a separate bundle from the routes. A second
// connection in the same process could block on the other's open transaction.
export const prisma = globalThis.__prisma ?? createClient();
globalThis.__prisma = prisma;
