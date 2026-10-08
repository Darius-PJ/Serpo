import Link from "next/link";
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
          <p className="page-lede mb-0">
            Your records are stored locally, with separate files for artifacts, credentials and browser state.
            Searches and enabled AI/contact research can contact external providers, including in the background.{" "}
            <Link href="/privacy" className="link-accent">Read Privacy and data use</Link>.
          </p>
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
          Scheduled work runs while Serpo&apos;s server is running. When saved-search automation is enabled, each due
          search catches up once after a restart. Daily stale scans stay local; enabled AI follow-up drafting and
          Submitted contact research can contact external services. Automation does not track jobs, apply, or send outreach.{" "}
          <Link href="/privacy#automation" className="link-accent">Defaults and how to disable</Link>.
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
        Saved answers are reused when the application assistant fills a matching employer form field. Review or delete
        them here; the website can access filled values before you click Submit.{" "}
        <Link href="/privacy#external-services" className="link-accent">Application assistance and data use</Link>.
      </p>
      <ProfileFieldList fields={fields} />
      <DangerZone />
    </div>
  );
}
