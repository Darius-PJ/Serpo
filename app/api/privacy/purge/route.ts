import { NextResponse } from "next/server";
import { keepApplication, purgeDecisionMakers, removeApplication, wipeAllData } from "@/lib/privacy/purge";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json();

  switch (body.action) {
    case "keep":
      return NextResponse.json({ application: await keepApplication(body.applicationId) });
    case "remove":
      return NextResponse.json({ application: await removeApplication(body.applicationId) });
    case "purge-decision-makers":
      return NextResponse.json({ result: await purgeDecisionMakers(body.applicationId) });
    case "wipe-all":
      // Second factor beyond the CSRF/content-type guard for the single most destructive action.
      if (body.confirm !== "WIPE") {
        return NextResponse.json({ error: 'confirm: "WIPE" is required for wipe-all' }, { status: 400 });
      }
      return NextResponse.json({ result: await wipeAllData() });
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
