import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { keepApplication, purgeDecisionMakers, removeApplication, wipeAllData } from "@/lib/privacy/purge";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function isNotFound(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();

  try {
    switch (body.action) {
      case "keep":
        return NextResponse.json({ application: await keepApplication(body.applicationId, userId) });
      case "remove":
        return NextResponse.json({ application: await removeApplication(body.applicationId, userId) });
      case "purge-decision-makers":
        return NextResponse.json({ result: await purgeDecisionMakers(body.applicationId, userId) });
      case "wipe-all":
        // Second factor beyond the CSRF/content-type guard + auth + the confirm dialog UI.
        if (body.confirm !== "WIPE") {
          return NextResponse.json({ error: 'confirm: "WIPE" is required for wipe-all' }, { status: 400 });
        }
        return NextResponse.json({ result: await wipeAllData(userId) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (isNotFound(err) || (err instanceof Error && err.message === "not found")) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw err;
  }
}
