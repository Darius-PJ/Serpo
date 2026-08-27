import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { listEnumerateTargetAdapters } from "@/lib/jobAdapters/registry";
import { runAdapterSearch } from "@/lib/jobAdapters/runSearch";
import { fetchSafeExternalUrl } from "@/lib/security/externalUrl";

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
  // closed-union detector to keep in sync as new ATS platforms are added.
  let matched: { adapterId: string; token: string } | null = null;
  for (const adapter of listEnumerateTargetAdapters()) {
    const token = adapter.detectTarget?.(board.url);
    if (token) {
      matched = { adapterId: adapter.metadata.id, token };
      break;
    }
  }

  let poolStatus: "live" | "browse-only" | "failed";
  let integrationType: string | null = null;
  let integrationToken: string | null = null;

  if (matched) {
    try {
      const correlationId = crypto.randomUUID();
      const adapter = listEnumerateTargetAdapters().find((a) => a.metadata.id === matched!.adapterId)!;
      const envelope = await runAdapterSearch({ kind: "target", target: matched.token }, [adapter], correlationId);
      if (envelope.errors.length > 0) throw new Error(envelope.errors[0].message);
      poolStatus = "live";
      integrationType = matched.adapterId;
      integrationToken = matched.token;
    } catch {
      poolStatus = "failed";
    }
  } else {
    try {
      const res = await fetchSafeExternalUrl(board.url, { method: "GET", signal: AbortSignal.timeout(10_000) });
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
