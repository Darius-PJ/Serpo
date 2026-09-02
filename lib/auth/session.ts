import "server-only";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import type { NextResponse } from "next/server";

const LOCAL_USERNAME = "local";
const DISABLED_PASSWORD_HASH = "single-user-workspace-no-password";

/**
 * Returns the sole local workspace owner.
 *
 * Existing installations keep using their oldest user row so removing the
 * login wall never disconnects previously stored applications. A fresh local
 * database gets one implementation-detail owner row used by the existing
 * relational schema; there is no account or authentication workflow.
 */
export async function getLocalUserId(): Promise<string> {
  const existing = await prisma.user.findFirst({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let userId = existing?.id;

  if (!userId) {
    try {
      const created = await prisma.user.create({
        data: { username: LOCAL_USERNAME, passwordHash: DISABLED_PASSWORD_HASH },
      });
      userId = created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.user.findUnique({ where: { username: LOCAL_USERNAME } });
        if (raced) userId = raced.id;
      }
      if (!userId) throw error;
    }
  }

  const [orphanedApplication, orphanedResume, orphanedProfile] = await Promise.all([
    prisma.application.findFirst({ where: { userId: null }, select: { id: true } }),
    prisma.resumeTemplate.findFirst({ where: { userId: null }, select: { id: true } }),
    prisma.profileField.findFirst({ where: { userId: null }, select: { id: true } }),
  ]);
  if (orphanedApplication || orphanedResume || orphanedProfile) {
    await prisma.$transaction([
      prisma.application.updateMany({ where: { userId: null }, data: { userId } }),
      prisma.resumeTemplate.updateMany({ where: { userId: null }, data: { userId } }),
      prisma.profileField.updateMany({ where: { userId: null }, data: { userId } }),
    ]);
  }
  return userId;
}

// Compatibility names keep the data-access layer changes small while making
// their semantics explicitly local and unconditional.
export const getCurrentUserId = getLocalUserId;
export const requireUserId = getLocalUserId;
export const requireUserIdForPage = getLocalUserId;
export async function requireApiUserId(): Promise<string | NextResponse> {
  return getLocalUserId();
}