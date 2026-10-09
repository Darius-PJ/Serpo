import "server-only";
import { prisma } from "@/lib/db/prisma";

export const SEARCH_HISTORY_LIMIT = 50;

/**
 * Records a search the account ran by hand, for company suggestions. Repeating
 * a search moves it to the top instead of adding a copy, and only the newest
 * SEARCH_HISTORY_LIMIT are kept. Saved-search runs are not recorded: they repeat
 * one search on a schedule and would drown out what the person actually typed.
 */
export async function recordSearch(userId: string, keywords: string, location?: string): Promise<void> {
  const entry = {
    keywords: keywords.trim().replace(/\s+/g, " ").toLowerCase(),
    location: (location ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
  };
  if (!entry.keywords) return;

  await prisma.searchHistoryEntry.upsert({
    where: { userId_keywords_location: { userId, ...entry } },
    update: { searchedAt: new Date() },
    create: { userId, ...entry },
  });
  const overflow = await prisma.searchHistoryEntry.findMany({
    where: { userId },
    orderBy: { searchedAt: "desc" },
    skip: SEARCH_HISTORY_LIMIT,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.searchHistoryEntry.deleteMany({ where: { id: { in: overflow.map((row) => row.id) } } });
  }
}
