import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";
import { deleteSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  await deleteSession();
  return NextResponse.json({ ok: true });
}
