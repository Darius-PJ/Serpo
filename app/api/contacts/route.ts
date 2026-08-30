import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { findOrCreateContact } from "@/lib/contacts/contacts";

export const dynamic = "force-dynamic";
const MAX_FIELD_LENGTH = 200;

function cleanField(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD_LENGTH) : "";
}

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const name = cleanField(body.name);
  const company = cleanField(body.company);
  if (!name || !company) {
    return NextResponse.json({ error: "name and company are required" }, { status: 400 });
  }

  // Same merge policy as discovery: adding a name that already exists at this
  // company enriches the existing contact instead of duplicating the person.
  const contact = await findOrCreateContact(userId, company, {
    name,
    title: cleanField(body.title) || null,
    email: cleanField(body.email) || null,
  });
  return NextResponse.json({ contact }, { status: 201 });
}
