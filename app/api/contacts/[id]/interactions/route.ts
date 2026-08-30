import { NextResponse } from "next/server";
import { parseISO, isValid } from "date-fns";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { logInteraction } from "@/lib/contacts/contacts";
import { isInteractionDirection, isInteractionKind } from "@/lib/contacts/types";

export const dynamic = "force-dynamic";
const MAX_NOTES_LENGTH = 2000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (!isInteractionKind(body.kind) || !isInteractionDirection(body.direction)) {
    return NextResponse.json({ error: "kind and direction must be valid interaction types" }, { status: 400 });
  }

  let occurredAt: Date | undefined;
  if (body.occurredAt !== undefined && body.occurredAt !== null) {
    const parsed = typeof body.occurredAt === "string" ? parseISO(body.occurredAt) : new Date(NaN);
    if (!isValid(parsed)) {
      return NextResponse.json({ error: "occurredAt must be an ISO date" }, { status: 400 });
    }
    occurredAt = parsed;
  }

  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, MAX_NOTES_LENGTH) : "";
  const applicationId = typeof body.applicationId === "string" ? body.applicationId : null;

  const interaction = await logInteraction(userId, {
    contactId: id,
    kind: body.kind,
    direction: body.direction,
    occurredAt,
    notes: notes || null,
    applicationId,
  });
  if (!interaction) {
    // Types were validated above, so a null means the contact (or linked
    // application) isn't this user's.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ interaction }, { status: 201 });
}
