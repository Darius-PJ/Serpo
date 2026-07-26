import { prisma } from "@/lib/db/prisma";
import { fetchGreenhouseBoard } from "./greenhouseBoard";
import { fetchLeverBoard } from "./leverBoard";
import type { JobSearchResult } from "./index";

/**
 * Queries this account's live search-pool boards (Greenhouse/Lever boards
 * verified via app/api/job-boards/[id]/pool/route.ts) as additional dynamic
 * per-user sources, alongside the static connectors in CONNECTORS.
 */
export async function searchPoolBoards(userId: string, criteria: { keywords: string }): Promise<JobSearchResult[]> {
  const pins = await prisma.jobBoardPin.findMany({
    where: { userId, poolStatus: "live", integrationType: { not: null } },
    include: { jobBoard: true },
  });

  return Promise.all(
    pins.map(async (pin): Promise<JobSearchResult> => {
      const source = `${pin.integrationType}:${pin.integrationToken}`;
      try {
        const fetcher = pin.integrationType === "greenhouse" ? fetchGreenhouseBoard : fetchLeverBoard;
        const listings = await fetcher(pin.integrationToken!, criteria);
        return { source, label: pin.jobBoard.name, listings };
      } catch (err) {
        return { source, label: pin.jobBoard.name, listings: [], error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}
