import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { listFollowUpDue } from "@/lib/scheduler/followUpCheck";
import { listStaleApplications, runStaleCheck } from "@/lib/scheduler/staleCheck";
import { StatusSelect } from "@/components/StatusSelect";
import { StaleReviewPanel } from "@/components/StaleReviewPanel";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";

const COLUMNS = APPLICATION_STATUSES;

export default async function DashboardPage() {
  const userId = await requireUserIdForPage();

  // Reading the dashboard must never call an AI provider or create outreach.
  await runStaleCheck(userId);

  const [applications, staleApplications, followUpsDue] = await Promise.all([
    prisma.application.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    listStaleApplications(userId),
    listFollowUpDue(userId),
  ]);
  const followUpDueIds = new Set(followUpsDue.map((application) => application.id));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-foreground">Applications</h1>
        <Link href="/sourcing" className="btn-primary px-3 py-1.5 text-sm">
          Source jobs
        </Link>
      </div>

      <StaleReviewPanel applications={staleApplications} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = applications.filter((application) => application.status === column);
          return (
            <div key={column} className="card-soft p-3">
              <h2 className="mb-2 text-sm font-bold text-primary-dark">
                {column} ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((application) => (
                  <li key={application.id} className="rounded-xl border border-border-soft p-2 text-sm">
                    <Link href={`/applications/${application.id}`} className="font-semibold text-foreground hover:text-primary-dark hover:underline">
                      {application.company}
                    </Link>
                    <div className="text-foreground-muted">{application.role}</div>
                    {followUpDueIds.has(application.id) && <div className="mt-1 text-xs text-amber-800">Follow-up draft due</div>}
                    <div className="mt-2">
                      <StatusSelect applicationId={application.id} status={application.status} />
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-foreground-muted">None</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
