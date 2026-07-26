import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { detectBoardIntegration } from "@/lib/jobSources/detectIntegration";
import { fetchGreenhouseBoard } from "@/lib/jobSources/greenhouseBoard";
import { fetchLeverBoard } from "@/lib/jobSources/leverBoard";

export const dynamic = "force-dynamic";

/**
 * Adds a saved board to this account's live search pool. Honest about what
 * that means: boards on a recognized ATS platform (Greenhouse/Lever) get
 * verified with a real query and become genuinely live-searchable
 * ("live"). Everything else only gets a reachability check — saved for
 * reference, clearly "browse-only", never a false checkmark implying live
 * search that isn't actually happening.
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

  const integration = detectBoardIntegration(board.url);
  let poolStatus: "live" | "browse-only" | "failed";
  let integrationType: string | null = null;
  let integrationToken: string | null = null;

  if (integration) {
    try {
      const fetcher = integration.type === "greenhouse" ? fetchGreenhouseBoard : fetchLeverBoard;
      await fetcher(integration.token, { keywords: "" });
      poolStatus = "live";
      integrationType = integration.type;
      integrationToken = integration.token;
    } catch {
      poolStatus = "failed";
    }
  } else {
    try {
      const res = await fetch(board.url, { method: "GET" });
      poolStatus = res.ok ? "browse-only" : "failed";
    } catch {
      poolStatus = "failed";
    }
  }

  const pin = await prisma.jobBoardPin.upsert({
    where: { userId_jobBoardId: { userId, jobBoardId: id } },
    update: { poolStatus, integrationType, integrationToken },
    create: { userId, jobBoardId: id, pinned: true, poolStatus, integrationType, integrationToken },
  });

  return NextResponse.json({ poolStatus: pin.poolStatus, integrationType: pin.integrationType });
}
