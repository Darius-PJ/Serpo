import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { runFollowUpCheck } from "@/lib/scheduler/followUpCheck";
import { listStaleApplications, runStaleCheck } from "@/lib/scheduler/staleCheck";
import { StatusSelect } from "@/components/StatusSelect";
import { StaleReviewPanel } from "@/components/StaleReviewPanel";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";

const COLUMNS = APPLICATION_STATUSES;

export default async function DashboardPage() {
  const userId = await requireUserIdForPage();

  // Runs on every dashboard load — no OS scheduler needed for a local app.
  // Scoped to this account only, otherwise loading the dashboard would
  // trigger real Claude API calls and stale-flag mutations against every
  // other account's applications too.
  await runFollowUpCheck(userId);
  await runStaleCheck(userId);

  const [applications, staleApplications] = await Promise.all([
    prisma.application.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    listStaleApplications(userId),
  ]);

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
          const items = applications.filter((a) => a.status === column);
          return (
            <div key={column} className="card-soft p-3">
              <h2 className="mb-2 text-sm font-bold text-primary-dark">
                {column} ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((app) => (
                  <li key={app.id} className="rounded-xl border border-border-soft p-2 text-sm">
                    <Link href={`/applications/${app.id}`} className="font-semibold text-foreground hover:text-primary-dark hover:underline">
                      {app.company}
                    </Link>
                    <div className="text-foreground-muted">{app.role}</div>
                    <div className="mt-2">
                      <StatusSelect applicationId={app.id} status={app.status} />
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
