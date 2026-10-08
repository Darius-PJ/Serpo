import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { getAutomationPreferences } from "@/lib/automation/settings";
import { systemTimeZone } from "@/lib/automation/slots";
import { ProfileFieldList } from "@/components/ProfileFieldList";
import { AutomationSettingsForm } from "@/components/AutomationSettingsForm";
import { DangerZone } from "@/components/DangerZone";
import { MotionPreferences } from "@/components/AppearanceControls";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUserIdForPage();
  const [fields, automation] = await Promise.all([
    prisma.profileField.findMany({ where: { userId }, orderBy: { label: "asc" } }),
    getAutomationPreferences(userId),
  ]);

  return (
    <div>
      <div className="page-heading mb-6">
        <div>
          <h1 className="mb-1 text-2xl font-extrabold text-heading">Settings</h1>
          <p className="page-lede mb-0">Everything Serpo knows is in one file on this computer. AI features run only with a key you add, and nothing is sent to anyone without your review.</p>
        </div>
      </div>
      <section aria-labelledby="appearance-heading" className="mb-10">
        <h2 id="appearance-heading" className="mb-1 text-lg font-bold text-heading">Appearance</h2>
        <p className="mb-4 max-w-prose text-base text-foreground-muted">
          Motion applies across all pages. System follows this device&apos;s preference; Reduced skips page formation.
          This preference stays in this browser.
        </p>
        <MotionPreferences />
      </section>
      <section aria-labelledby="automation-heading" className="mb-10">
        <h2 id="automation-heading" className="mb-1 text-lg font-bold text-heading">Automation</h2>
        <p className="mb-4 max-w-prose text-base text-foreground-muted">
          Nothing runs while Serpo is closed. Each saved search that came due runs once when Serpo next opens. Stale
          applications are checked daily, and follow-up drafts are written daily only when AI assistance is on.
          Automation never tracks a job, applies, or sends anything.
        </p>
        <AutomationSettingsForm
          enabled={automation.enabled}
          timezone={automation.timezone}
          jobSpyConsent={automation.jobSpyConsent}
          systemTimeZone={systemTimeZone()}
          timeZones={Intl.supportedValuesOf("timeZone")}
        />
      </section>
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
