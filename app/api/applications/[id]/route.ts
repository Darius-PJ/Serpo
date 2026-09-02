import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isApplicationStatus } from "@/lib/applicationStatus";
import { changeApplicationStatus } from "@/lib/applications/changeStatus";

export const dynamic = "force-dynamic";
const MAX_FIELD_LENGTH = 200;
const MAX_NOTES_LENGTH = 10_000;
const MAX_DESCRIPTION_LENGTH = 20_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id_userId: { id, userId } },
    include: { contactLinks: { include: { contact: true } }, messages: true },
  });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ application });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.status !== undefined && !isApplicationStatus(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const company = body.company === undefined ? undefined : typeof body.company === "string" ? body.company.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const role = body.role === undefined ? undefined : typeof body.role === "string" ? body.role.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const notes = body.notes === undefined ? undefined : typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_LENGTH) : "";
  const description = body.description === undefined
    ? undefined
    : typeof body.description === "string"
      ? body.description.slice(0, MAX_DESCRIPTION_LENGTH)
      : null;
  if (company !== undefined && !company) {
    return NextResponse.json({ error: "company cannot be empty" }, { status: 400 });
  }
  if (role !== undefined && !role) {
    return NextResponse.json({ error: "role cannot be empty" }, { status: 400 });
  }
  if (notes !== undefined && typeof body.notes !== "string") return NextResponse.json({ error: "notes must be text" }, { status: 400 });
  if (description === null) return NextResponse.json({ error: "description must be text" }, { status: 400 });

  const existing = await prisma.application.findUnique({ where: { id_userId: { id, userId } } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let application = existing;
  if (company !== undefined || role !== undefined || notes !== undefined || description !== undefined) {
    application = await prisma.application.update({
      where: { id },
      data: {
        ...(company !== undefined ? { company } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  // Status moves go through the one shared path so every change — dropdown or
  // kanban drag — applies the Submitted side effects and records the
  // status_changed AuditEvent that funnel metrics depend on.
  if (body.status !== undefined) {
    const changed = await changeApplicationStatus(userId, id, body.status);
    if (!changed) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    application = changed;
  }

  return NextResponse.json({ application });
}
