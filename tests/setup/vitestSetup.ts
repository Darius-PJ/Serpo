import { afterEach } from "vitest";

// Must be set before anything imports lib/db/prisma.
process.env.DATABASE_URL = "file:./data/test.db";

afterEach(async () => {
  const { prisma } = await import("@/lib/db/prisma");
  // Global, no FK to User — order-independent.
  await prisma.jobListingFingerprint.deleteMany();
  await prisma.jobSourceCache.deleteMany();
  // FK-safe order: children before parents.
  await prisma.message.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.contactApplication.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.task.deleteMany();
  await prisma.applyRun.deleteMany();
  await prisma.application.deleteMany();
  await prisma.jobBoardPin.deleteMany();
  await prisma.jobBoard.deleteMany();
  await prisma.resumeTemplate.deleteMany();
  await prisma.profileField.deleteMany();
  await prisma.user.deleteMany();
});
