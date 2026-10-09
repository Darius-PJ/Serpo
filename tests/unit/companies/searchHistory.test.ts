import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { recordSearch, SEARCH_HISTORY_LIMIT } from "@/lib/companies/searchHistory";

async function history(userId: string) {
  const rows = await prisma.searchHistoryEntry.findMany({ where: { userId }, orderBy: { searchedAt: "desc" } });
  return rows.map((row) => [row.keywords, row.location]);
}

describe("recordSearch", () => {
  it("repeating a search, in any case or spacing, moves it to the top instead of adding a copy", async () => {
    const user = await prisma.user.create({ data: { username: "history-repeat", passwordHash: "unused" } });
    await recordSearch(user.id, "Night Nurse", "Atlanta, GA");
    // Age that search behind a newer one, so moving back to the top is observable.
    await prisma.searchHistoryEntry.updateMany({ where: { userId: user.id }, data: { searchedAt: new Date(Date.now() - 60_000) } });
    await prisma.searchHistoryEntry.create({ data: { userId: user.id, keywords: "line cook", searchedAt: new Date(Date.now() - 30_000) } });

    await recordSearch(user.id, "  night   nurse ", "atlanta, ga");

    expect(await history(user.id)).toEqual([
      ["night nurse", "atlanta, ga"],
      ["line cook", ""],
    ]);
  });

  it("keeps the same words searched in a different place as a separate search", async () => {
    const user = await prisma.user.create({ data: { username: "history-places", passwordHash: "unused" } });
    await recordSearch(user.id, "welder", "Austin, TX");
    await recordSearch(user.id, "welder", "Dallas, TX");
    expect(await history(user.id)).toHaveLength(2);
  });

  it("keeps only the newest searches once the limit is reached", async () => {
    const user = await prisma.user.create({ data: { username: "history-cap", passwordHash: "unused" } });
    const base = Date.now() - 1_000_000;
    await prisma.searchHistoryEntry.createMany({
      data: Array.from({ length: SEARCH_HISTORY_LIMIT }, (_, i) => ({ userId: user.id, keywords: `search ${i}`, searchedAt: new Date(base + i * 1000) })),
    });

    await recordSearch(user.id, "newest search");

    const kept = await history(user.id);
    expect(kept).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(kept[0]).toEqual(["newest search", ""]);
    expect(kept.map(([keywords]) => keywords)).not.toContain("search 0");
    expect(kept.map(([keywords]) => keywords)).toContain("search 1");
  });

  it("ignores blank keywords", async () => {
    const user = await prisma.user.create({ data: { username: "history-blank", passwordHash: "unused" } });
    await recordSearch(user.id, "   ");
    expect(await history(user.id)).toEqual([]);
  });
});
