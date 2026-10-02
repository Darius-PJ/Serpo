import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { CADENCES, isCadence, type Cadence } from "@/lib/automation/cadence";
import { deleteSavedSearch, SavedSearchInputError, updateSavedSearch } from "@/lib/savedSearches/savedSearches";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const input = body && typeof body === "object" ? body : {};

  const patch: { name?: string; cadence?: Cadence; enabled?: boolean } = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    patch.name = input.name;
  }
  if (input.cadence !== undefined) {
    if (!isCadence(input.cadence)) {
      return NextResponse.json({ error: `cadence must be one of ${CADENCES.map((c) => c.value).join(", ")}` }, { status: 400 });
    }
    patch.cadence = input.cadence;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "provide name, cadence, or enabled" }, { status: 400 });
  }

  try {
    const savedSearch = await updateSavedSearch(userId, id, patch);
    if (!savedSearch) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ savedSearch });
  } catch (err) {
    if (err instanceof SavedSearchInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const deleted = await deleteSavedSearch(userId, id);
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
