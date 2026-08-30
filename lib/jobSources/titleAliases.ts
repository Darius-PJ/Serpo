// User-curated title aliases: "when I search <keyword>, treat <alias> as my
// target role." Matching one outranks an O*NET family match — the user said so
// explicitly (see scoreTitleRelevance in titleMatch.ts).
import { prisma } from "@/lib/db/prisma";
import { normalizeTitleLoose as normalizeLoose } from "@/lib/jobSources/titleMatch";

export interface StoredTitleAlias {
  id: string;
  alias: string;
}

export async function listTitleAliases(userId: string, keywords: string): Promise<StoredTitleAlias[]> {
  const keyword = normalizeLoose(keywords);
  if (!keyword) return [];
  const rows = await prisma.titleAlias.findMany({ where: { userId, keyword }, orderBy: { alias: "asc" } });
  return rows.map((row) => ({ id: row.id, alias: row.alias }));
}

export async function addTitleAlias(userId: string, keywords: string, rawAlias: string): Promise<StoredTitleAlias> {
  const keyword = normalizeLoose(keywords);
  const alias = normalizeLoose(rawAlias);
  if (!keyword || !alias) throw new Error("keyword and alias are required");
  const row = await prisma.titleAlias.upsert({
    where: { userId_keyword_alias: { userId, keyword, alias } },
    update: {},
    create: { userId, keyword, alias },
  });
  return { id: row.id, alias: row.alias };
}

/** Deletes the alias if it belongs to this user; false when it doesn't exist or is someone else's. */
export async function removeTitleAlias(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.titleAlias.deleteMany({ where: { id, userId } });
  return count > 0;
}
