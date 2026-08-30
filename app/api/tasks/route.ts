import { NextResponse } from "next/server";
import { isValid, parseISO } from "date-fns";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { createTask } from "@/lib/tasks/tasks";

export const dynamic = "force-dynamic";
const MAX_TITLE_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  let dueAt: Date | null = null;
  if (body.dueAt !== undefined && body.dueAt !== null) {
    // parseISO reads a date-only string ("2026-09-02") as local midnight —
    // new Date() would read it as UTC and shift the due day in negative offsets.
    const parsed = typeof body.dueAt === "string" ? parseISO(body.dueAt) : new Date(NaN);
    if (!isValid(parsed)) {
      return NextResponse.json({ error: "dueAt must be an ISO date" }, { status: 400 });
    }
    dueAt = parsed;
  }

  const applicationId = body.applicationId === undefined || body.applicationId === null ? null : body.applicationId;
  if (applicationId !== null && typeof applicationId !== "string") {
    return NextResponse.json({ error: "applicationId must be a string" }, { status: 400 });
  }

  const task = await createTask(userId, { title, dueAt, applicationId });
  if (!task) {
    // The title was validated above, so a null here means the linked
    // application does not exist for this user.
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }
  return NextResponse.json({ task }, { status: 201 });
}
