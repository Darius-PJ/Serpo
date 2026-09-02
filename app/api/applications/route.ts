import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { assertSafeExternalUrl, UnsafeExternalUrlError } from "@/lib/security/externalUrl";
import { isApplicationStatus } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";
const MAX_FIELD_LENGTH = 200;

export async function GET(request: Request) {
  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const applications = await prisma.application.findMany({
    where: { userId },
    include: { messages: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ applications, limit, hasMore: applications.length === limit });
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const company = typeof body.company === "string" ? body.company.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const source = typeof body.source === "string" ? body.source.trim().slice(0, MAX_FIELD_LENGTH) : "manual";
  const status = body.status === undefined ? "Sourced" : body.status;
  if (!company || !role) {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }
  if (!source || !isApplicationStatus(status)) {
    return NextResponse.json({ error: "invalid application source or status" }, { status: 400 });
  }

  let url: string | null = null;
  if (body.url !== undefined && body.url !== null) {
    try {
      url = (await assertSafeExternalUrl(body.url)).toString();
    } catch (err) {
      if (err instanceof UnsafeExternalUrlError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      return NextResponse.json({ error: "could not validate application URL" }, { status: 400 });
    }
  }

  const application = await prisma.application.create({
    data: {
      userId,
      company,
      role,
      source,
      url,
      description: typeof body.description === "string" ? body.description.slice(0, 20_000) : null,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 10_000) : null,
      status,
    },
  });

  return NextResponse.json({ application }, { status: 201 });
}
