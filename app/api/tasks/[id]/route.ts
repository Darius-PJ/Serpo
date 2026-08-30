import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { completeTask, snoozeTask } from "@/lib/tasks/tasks";

export const dynamic = "force-dynamic";
const MAX_SNOOZE_DAYS = 30;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.completed === true) {
    const task = await completeTask(userId, id);
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ task });
  }

  if (body.snoozeDays !== undefined) {
    if (!Number.isInteger(body.snoozeDays) || body.snoozeDays < 1 || body.snoozeDays > MAX_SNOOZE_DAYS) {
      return NextResponse.json({ error: `snoozeDays must be an integer from 1 to ${MAX_SNOOZE_DAYS}` }, { status: 400 });
    }
    const task = await snoozeTask(userId, id, addDays(new Date(), body.snoozeDays));
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ task });
  }

  return NextResponse.json({ error: "provide completed: true or snoozeDays" }, { status: 400 });
}
