import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { dismissSavedSearchHit } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; hitId: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id, hitId } = await params;
  const body = await request.json().catch(() => ({}));
  if (body?.dismissed !== true) {
    return NextResponse.json({ error: "provide dismissed: true" }, { status: 400 });
  }

  const dismissed = await dismissSavedSearchHit(userId, id, hitId);
  if (!dismissed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
