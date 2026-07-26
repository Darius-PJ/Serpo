import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { normalizeUsername } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS = { error: "invalid username or password" } as const;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json().catch(() => ({}));
  if (typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  const username = normalizeUsername(body.username);
  const user = await prisma.user.findUnique({ where: { username } });

  // Same generic error whether the username doesn't exist or the password is
  // wrong — doesn't leak which part was incorrect.
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: { id: user.id, username: user.username } });
}
