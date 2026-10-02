import { NextResponse } from "next/server";
import { requireApiUserId } from "@/lib/auth/session";
import { listNewListingCounts } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

/** New listings across every saved search: the count on the Sourcing nav badge. */
export async function GET() {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const counts = await listNewListingCounts(userId);
  return NextResponse.json({ count: counts.reduce((sum, entry) => sum + entry.count, 0) });
}
