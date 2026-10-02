import { NextResponse } from "next/server";
import { requireApiUserId } from "@/lib/auth/session";
import { listSavedSearchHits } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const hits = await listSavedSearchHits(userId, id);
  if (!hits) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ hits });
}
