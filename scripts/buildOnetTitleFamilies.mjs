// Regenerates lib/jobSources/roleFamilies/onetTitleFamilies.json.gz from the
// O*NET database text distribution (https://www.onetcenter.org/database.html,
// CC BY 4.0 — see lib/jobSources/roleFamilies/ONET-LICENSE.txt).
//
// Usage:
//   1. Download db_XX_X_text.zip from onetcenter.org and extract it anywhere.
//   2. node scripts/buildOnetTitleFamilies.mjs <path-to-extracted-dir>
//
// Reads three files: "Job Titles.txt" (54k reported/alternate job titles per
// O*NET-SOC occupation — named "Alternate Titles.txt" before DB 30.0),
// "Occupation Data.txt" (occupation names), and "Related Occupations.txt"
// (cross-occupation links; only Primary-Short rows are kept, so families widen
// by one conservative hop).
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("usage: node scripts/buildOnetTitleFamilies.mjs <path-to-db_XX_X_text-dir>");
  process.exit(1);
}

const OUTPUT = path.join(process.cwd(), "lib", "jobSources", "roleFamilies", "onetTitleFamilies.json.gz");

function normalizeTitle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// "IT Network Engineer (Information Technology Network Engineer)" carries two
// usable aliases — split the parenthetical expansion into its own entry.
function titleVariants(raw) {
  const match = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const variants = match ? [match[1], match[2]] : [raw];
  return variants.map(normalizeTitle).filter(Boolean);
}

function readRows(filename) {
  const filePath = path.join(sourceDir, filename);
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => line.split("\t")); // slice(1): header row
}

const aliasesBySoc = new Map();
function addAlias(soc, alias) {
  if (!alias) return;
  if (!aliasesBySoc.has(soc)) aliasesBySoc.set(soc, new Set());
  aliasesBySoc.get(soc).add(alias);
}

let titleRows = 0;
for (const [soc, title, shortTitle] of readRows("Job Titles.txt")) {
  titleRows += 1;
  for (const variant of titleVariants(title)) addAlias(soc, variant);
  if (shortTitle && shortTitle !== "n/a") addAlias(soc, normalizeTitle(shortTitle));
}

const occupations = {};
for (const [soc, title] of readRows("Occupation Data.txt")) {
  occupations[soc] = title;
  addAlias(soc, normalizeTitle(title));
}

const relatedShort = {};
for (const [soc, relatedSoc, tier] of readRows("Related Occupations.txt")) {
  if (tier !== "Primary-Short") continue;
  (relatedShort[soc] ??= []).push(relatedSoc);
}

const versionMatch = sourceDir.match(/db_(\d+)_(\d+)/);
const artifact = {
  onetVersion: versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : "unknown",
  source: "https://www.onetcenter.org/database.html",
  license: "CC BY 4.0 — see ONET-LICENSE.txt",
  occupations,
  relatedShort,
  aliases: Object.fromEntries([...aliasesBySoc].map(([soc, set]) => [soc, [...set].sort()])),
};

const json = JSON.stringify(artifact);
writeFileSync(OUTPUT, gzipSync(Buffer.from(json), { level: 9 }));
const aliasCount = [...aliasesBySoc.values()].reduce((sum, set) => sum + set.size, 0);
console.log(
  `O*NET ${artifact.onetVersion}: ${titleRows} title rows -> ${aliasCount} aliases across ${aliasesBySoc.size} occupations; ` +
    `json ${(json.length / 1024).toFixed(0)}KB, gz ${(gzipSync(Buffer.from(json), { level: 9 }).length / 1024).toFixed(0)}KB -> ${OUTPUT}`
);
