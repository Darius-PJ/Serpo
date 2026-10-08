import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { RaekwonPanel } from "@/components/RaekwonPanel";

export const dynamic = "force-dynamic";

export default async function RaekwonPage() {
  const userId = await requireUserIdForPage();

  const [report, trackedApplications] = await Promise.all([
    prisma.raekwonReport.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { leads: { orderBy: { rank: "asc" } } },
    }),
    prisma.application.findMany({
      where: { userId, url: { not: null } },
      select: { url: true },
    }),
  ]);

  return (
    <div>
      <div className="page-heading mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">AI Scout</h1>
          <p className="page-lede mb-0 mt-1">
            Generate a focused lead batch from configured job sources and review which sources performed best.
          </p>
        </div>
      </div>

      <RaekwonPanel
        initialReport={report}
        initialLeads={report?.leads ?? []}
        initialTrackedUrls={trackedApplications.flatMap((application) => application.url ? [application.url] : [])}
      />
    </div>
  );
}
