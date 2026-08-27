import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { confirmApplicationSubmission, makeUserAttestationEvidence } from "@/lib/apply/submission";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "SUBMITTED") {
    return NextResponse.json({ error: 'confirm: "SUBMITTED" is required' }, { status: 400 });
  }

  const { id, runId } = await params;
  try {
    const confirmed = await confirmApplicationSubmission({
      applicationId: id,
      userId,
      applyRunId: runId,
      evidence: makeUserAttestationEvidence(),
    });
    return NextResponse.json(confirmed);
  } catch (err) {
    if (err instanceof Error && (err.message === "not found" || err.message === "apply run not found")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "apply run cannot be confirmed in its current state") {
      return NextResponse.json({ error: "this apply run is not ready to be confirmed" }, { status: 409 });
    }
    throw err;
  }
}
