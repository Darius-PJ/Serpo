import "server-only";
import { prisma } from "@/lib/db/prisma";
import { listEnumerateTargetAdapters } from "@/lib/jobAdapters/registry";
import { companyKey } from "./catalog";

export interface FollowedCompany {
  boardId: string;
  name: string;
  url: string;
  /** companyKey() of the board, matching catalog entries and hidden suggestions. */
  key: string;
  /** The pool verification result; null until verification has run. Only "live" boards are searched. */
  poolStatus: string | null;
}

/**
 * The account's own boards that are a company's job board on a supported
 * platform — followed from the Companies page or added by hand on Sourcing.
 * Recognition is the same detectTarget() the pool check uses.
 */
export async function listFollowedCompanies(userId: string): Promise<FollowedCompany[]> {
  const [boards, pins] = await Promise.all([
    prisma.jobBoard.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.jobBoardPin.findMany({ where: { userId }, select: { jobBoardId: true, poolStatus: true } }),
  ]);
  const adapters = listEnumerateTargetAdapters();
  const poolStatusByBoard = new Map(pins.map((pin) => [pin.jobBoardId, pin.poolStatus]));

  return boards.flatMap((board) => {
    for (const adapter of adapters) {
      const token = adapter.detectTarget?.(board.url);
      if (token) {
        return [{
          boardId: board.id,
          name: board.name,
          url: board.url,
          key: companyKey(adapter.metadata.id, token),
          poolStatus: poolStatusByBoard.get(board.id) ?? null,
        }];
      }
    }
    return [];
  });
}
