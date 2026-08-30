// O*NET-derived role families (see ONET-LICENSE.txt; regenerate the artifact
// with scripts/buildOnetTitleFamilies.mjs). Maps a searched keyword onto the
// O*NET-SOC occupations whose reported job titles contain it, widens by one
// Primary-Short hop of related occupations, and returns that family's whole
// alias vocabulary — how "network engineer" learns that "network administrator"
// and "infrastructure analyst" carry the same responsibilities.
//
// Loaded lazily from a gzipped JSON artifact via process.cwd(), the same
// runtime-path pattern as lib/db/prisma.ts and the jobspy script.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { normalizeTitleLoose } from "@/lib/jobSources/titleMatch";

interface RoleFamiliesArtifact {
  onetVersion: string;
  occupations: Record<string, string>;
  relatedShort: Record<string, string[]>;
  aliases: Record<string, string[]>;
}

let artifact: RoleFamiliesArtifact | null = null;
const familyCache = new Map<string, { socs: string[]; aliases: string[] }>();

function loadArtifact(): RoleFamiliesArtifact {
  if (!artifact) {
    const artifactPath = path.join(process.cwd(), "lib", "jobSources", "roleFamilies", "onetTitleFamilies.json.gz");
    artifact = JSON.parse(gunzipSync(readFileSync(artifactPath)).toString("utf8")) as RoleFamiliesArtifact;
  }
  return artifact;
}

const normalizeLoose = normalizeTitleLoose;

function containsPhrase(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

function computeFamily(keywords: string): { socs: string[]; aliases: string[] } {
  const needle = normalizeLoose(keywords);
  if (!needle) return { socs: [], aliases: [] };
  const cached = familyCache.get(needle);
  if (cached) return cached;

  const data = loadArtifact();
  const directSocs = Object.keys(data.aliases).filter((soc) => data.aliases[soc].some((alias) => containsPhrase(alias, needle)));

  const pool = new Set(directSocs);
  for (const soc of directSocs) {
    for (const related of data.relatedShort[soc] ?? []) pool.add(related);
  }

  const aliasSet = new Set<string>();
  for (const soc of pool) {
    for (const alias of data.aliases[soc] ?? []) aliasSet.add(alias);
  }

  const family = { socs: [...pool].sort(), aliases: [...aliasSet].sort() };
  familyCache.set(needle, family);
  return family;
}

/** O*NET-SOC codes in the searched keyword's role family (direct + one Primary-Short hop). */
export function familySocCodesFor(keywords: string): string[] {
  return computeFamily(keywords).socs;
}

/** Normalized alias titles for the searched keyword's role family. */
export function familyAliasesFor(keywords: string): string[] {
  return computeFamily(keywords).aliases;
}
