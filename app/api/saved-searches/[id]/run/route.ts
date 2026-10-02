import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { runSavedSearch } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

/** "Run now": an attended run, so every board the search selected is used, paused or not. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const run = await runSavedSearch(userId, id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}
