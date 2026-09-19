import { NextResponse } from "next/server";
import { addEliminatedJob, removeEliminatedJob, normalizeListingUrl } from "@/lib/jobSources/eliminatedJobs";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const MAX_FIELD_LENGTH = 200;

function optionalField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.slice(0, MAX_FIELD_LENGTH) : undefined;
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const url = normalizeListingUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: "a valid url is required" }, { status: 400 });
  }

  await addEliminatedJob(userId, {
    url,
    company: optionalField(body.company),
    role: optionalField(body.role),
    source: optionalField(body.source),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const url = normalizeListingUrl(body.url);
  if (!url) {
    return NextResponse.json({ error: "a valid url is required" }, { status: 400 });
  }

  // Idempotent: 200 even when nothing was removed, so in-session Undo never
  // errors on a row another tab (or a prior undo) already deleted.
  await removeEliminatedJob(userId, url);
  return NextResponse.json({ ok: true });
}
