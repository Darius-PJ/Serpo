import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma's CLI only auto-loads `.env`, but this project follows Next.js
// convention and keeps secrets in `.env.local` — load it explicitly.
loadEnv({ path: ".env.local", quiet: true });

const dbFile = process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./data/app.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: `file:${path.resolve(process.cwd(), dbFile)}`,
  },
});
