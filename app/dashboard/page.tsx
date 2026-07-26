import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { runFollowUpCheck } from "@/lib/scheduler/followUpCheck";
import { listStaleApplications, runStaleCheck } from "@/lib/scheduler/staleCheck";
import { StatusSelect } from "@/components/StatusSelect";
import { StaleReviewPanel } from "@/components/StaleReviewPanel";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";

export const dynamic = "force-dynamic";

const COLUMNS = APPLICATION_STATUSES;

export default async function DashboardPage() {
  // Runs on every dashboard load — no OS scheduler needed for a local app.
  await runFollowUpCheck();
  await runStaleCheck();

  const [applications, staleApplications] = await Promise.all([
    prisma.application.findMany({ orderBy: { createdAt: "desc" } }),
    listStaleApplications(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Applications</h1>
        <Link
          href="/sourcing"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
        >
          Source jobs
        </Link>
      </div>

      <StaleReviewPanel applications={staleApplications} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = applications.filter((a) => a.status === column);
          return (
            <div key={column} className="rounded border border-neutral-200 p-3">
              <h2 className="mb-2 text-sm font-semibold text-neutral-600">
                {column} ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((app) => (
                  <li key={app.id} className="rounded border border-neutral-200 p-2 text-sm">
                    <Link href={`/applications/${app.id}`} className="font-medium hover:underline">
                      {app.company}
                    </Link>
                    <div className="text-neutral-600">{app.role}</div>
                    <div className="mt-2">
                      <StatusSelect applicationId={app.id} status={app.status} />
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-neutral-400">None</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
