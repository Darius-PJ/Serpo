import { prisma } from "@/lib/db/prisma";
import { ProfileFieldList } from "@/components/ProfileFieldList";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const fields = await prisma.profileField.findMany({ orderBy: { label: "asc" } });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Saved answers</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Auto-apply saves an answer here the first time it hits a form field it can&apos;t map to
        anything known, then reuses it silently on every later application. Review or delete
        anything here directly.
      </p>
      <ProfileFieldList fields={fields} />
    </div>
  );
}
