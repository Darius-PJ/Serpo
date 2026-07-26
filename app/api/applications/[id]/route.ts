import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateMessage } from "@/lib/ai/generateMessage";
import { requireJsonRequest } from "@/lib/security/guard";
import { isApplicationStatus } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: { decisionMakers: true, messages: true },
  });
  if (!application) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ application });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const { id } = await params;
  const body = await request.json();

  if (body.status !== undefined && !isApplicationStatus(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (body.company !== undefined && !body.company?.trim()) {
    return NextResponse.json({ error: "company cannot be empty" }, { status: 400 });
  }
  if (body.role !== undefined && !body.role?.trim()) {
    return NextResponse.json({ error: "role cannot be empty" }, { status: 400 });
  }

  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isNewlySubmitted = body.status === "Submitted" && existing.status !== "Submitted";

  const application = await prisma.application.update({
    where: { id },
    data: {
      ...(body.company !== undefined ? { company: body.company } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(isNewlySubmitted && !existing.appliedAt ? { appliedAt: new Date() } : {}),
    },
  });

  if (isNewlySubmitted) {
    const alreadyHasImmediate = await prisma.message.findFirst({
      where: { applicationId: id, type: "IMMEDIATE" },
    });
    if (!alreadyHasImmediate) {
      await generateMessage(id, "IMMEDIATE");
    }
  }

  return NextResponse.json({ application });
}
