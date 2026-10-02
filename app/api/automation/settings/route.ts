import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { isValidTimeZone } from "@/lib/automation/slots";
import { updateAutomationPreferences, type AutomationPreferencesPatch } from "@/lib/automation/settings";
import { selectedJobSpySites } from "@/lib/jobSpyBoards";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const input = body && typeof body === "object" ? body : {};

  const patch: AutomationPreferencesPatch = {};
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    patch.enabled = input.enabled;
  }
  if (input.timezone !== undefined) {
    // Null or empty follows this computer's zone.
    if (input.timezone === null || input.timezone === "") {
      patch.timezone = null;
    } else if (isValidTimeZone(input.timezone)) {
      patch.timezone = input.timezone;
    } else {
      return NextResponse.json({ error: "timezone must be an IANA time zone such as America/New_York" }, { status: 400 });
    }
  }
  if (input.jobSpyConsent !== undefined) {
    if (!Array.isArray(input.jobSpyConsent)) {
      return NextResponse.json({ error: "jobSpyConsent must be a list of JobSpy boards" }, { status: 400 });
    }
    patch.jobSpyConsent = selectedJobSpySites(input.jobSpyConsent);
  }

  const settings = await updateAutomationPreferences(userId, patch);
  return NextResponse.json({ settings });
}
