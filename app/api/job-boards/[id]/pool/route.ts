import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { listEnumerateTargetAdapters } from "@/lib/jobAdapters/registry";
import { runAdapterSearch } from "@/lib/jobAdapters/runSearch";
import { fetchSafeExternalUrl } from "@/lib/security/externalUrl";
import { verifyBoardForPool } from "@/lib/jobBoards/poolVerification";

export const dynamic = "force-dynamic";

/**
 * Adds a saved board to this account's live search pool. Honest about what
 * that means: boards on a recognized ATS platform (an enumerate-target adapter
 * that recognizes the URL, e.g. Greenhouse/Lever) get verified with a real
 * query and become genuinely live-searchable ("live"). Everything else only
 * gets a reachability check — saved for reference, clearly "browse-only",
 * never a false checkmark implying live search that isn't actually happening.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const board = await prisma.jobBoard.findUnique({ where: { id } });
  if (!board) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (board.userId !== null && board.userId !== userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Every enumerate-target adapter declares its own detectTarget() — no shared,
  // closed-union detector to keep in sync as new ATS platforms are added. The
  // live/browse-only/failed decision itself lives in lib/jobBoards/poolVerification.
  const { poolStatus, integrationType, integrationToken } = await verifyBoardForPool(
    board.url,
    listEnumerateTargetAdapters(),
    {
      searchTarget: (adapter, token) =>
        runAdapterSearch({ kind: "target", target: token }, [adapter], crypto.randomUUID()),
      fetchUrl: (url) => fetchSafeExternalUrl(url, { method: "GET", signal: AbortSignal.timeout(10_000) }),
    },
  );

  const pin = await prisma.jobBoardPin.upsert({
    where: { userId_jobBoardId: { userId, jobBoardId: id } },
    update: { poolStatus, integrationType, integrationToken },
    create: { userId, jobBoardId: id, pinned: true, poolStatus, integrationType, integrationToken },
  });

  return NextResponse.json({ poolStatus: pin.poolStatus, integrationType: pin.integrationType });
}
