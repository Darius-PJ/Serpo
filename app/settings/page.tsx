import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { ProfileFieldList } from "@/components/ProfileFieldList";
import { DangerZone } from "@/components/DangerZone";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserIdForPage();
  const fields = await prisma.profileField.findMany({ where: { userId }, orderBy: { label: "asc" } });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-heading">Settings</h1>
      <p className="page-lede">Everything Serpo knows is in one file on this computer. AI features run only with a key you add, and nothing is sent to anyone without your review.</p>
      <h2 className="mb-1 text-lg font-bold text-heading">Saved answers</h2>
      <p className="mb-4 text-base text-foreground-muted">
        Auto-apply saves an answer here the first time it hits a form field it can&apos;t map to
        anything known, then reuses it silently on every later application. Review or delete
        anything here directly.
      </p>
      <ProfileFieldList fields={fields} />
      <DangerZone />
    </div>
  );
}
