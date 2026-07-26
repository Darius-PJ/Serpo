// Plain JS (not TS) and a direct relative import of the generated Prisma client —
// this runs under plain `node`, which has no knowledge of the "@/*" tsconfig
// path alias the rest of the app uses, so it can't reuse lib/db/prisma.ts as-is.
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/index.js";

// Keep in sync with lib/jobBoards/curatedSeed.ts — duplicated here rather than
// imported so this script has no dependency on TS path-alias resolution.
const CURATED_BOARDS = [
  { name: "CalCareers", url: "https://www.calcareers.ca.gov", jurisdiction: "state", region: "CA" },
  { name: "StateJobsNY", url: "https://statejobs.ny.gov", jurisdiction: "state", region: "NY" },
  { name: "Work in Texas", url: "https://www.workintexas.com", jurisdiction: "state", region: "TX" },
  { name: "People First (Florida)", url: "https://jobs.myflorida.com", jurisdiction: "state", region: "FL" },
  {
    name: "GovernmentJobs.com (NEOGOV)",
    url: "https://www.governmentjobs.com",
    jurisdiction: "municipal",
    region: "Multi-state city/county aggregator",
  },
];

const adapter = new PrismaBetterSqlite3({
  url: `file:${path.resolve(process.cwd(), "data/app.db")}`,
});
const prisma = new PrismaClient({ adapter });

for (const board of CURATED_BOARDS) {
  const existing = await prisma.jobBoard.findFirst({ where: { url: board.url } });
  if (existing) continue;
  await prisma.jobBoard.create({ data: { ...board, source: "curated", pinned: true } });
  console.log("seeded:", board.name);
}

await prisma.$disconnect();
