import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { isValidUsername, normalizeUsername } from "@/lib/validators";
import { hashPassword, isValidPasswordLength } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" ? normalizeUsername(body.username) : "";

  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "username must be 3-32 characters: letters, numbers, underscore, hyphen, or dot" },
      { status: 400 }
    );
  }
  if (!isValidPasswordLength(body.password)) {
    return NextResponse.json({ error: "password must be 8-128 characters" }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const isFirstEver = (await tx.user.count()) === 0;
      const created = await tx.user.create({ data: { username, passwordHash } });

      // The very first account ever created adopts any pre-multi-user local
      // data instead of leaving it permanently orphaned (userId stays null
      // forever otherwise, since this app never forces that column NOT NULL).
      // Curated JobBoard rows are deliberately excluded — they stay shared.
      if (isFirstEver) {
        await tx.application.updateMany({ where: { userId: null }, data: { userId: created.id } });
        await tx.resumeTemplate.updateMany({ where: { userId: null }, data: { userId: created.id } });
        await tx.profileField.updateMany({ where: { userId: null }, data: { userId: created.id } });
      }

      return created;
    });

    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, username: user.username } }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "username already taken" }, { status: 409 });
    }
    throw err;
  }
}
