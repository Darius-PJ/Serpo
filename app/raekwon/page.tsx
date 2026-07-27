import { prisma } from "@/lib/db/prisma";
import { requireUserIdForPage } from "@/lib/auth/session";
import { RaekwonPanel } from "@/components/RaekwonPanel";

export const dynamic = "force-dynamic";

export default async function RaekwonPage() {
  const userId = await requireUserIdForPage();

  const report = await prisma.raekwonReport.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { leads: { orderBy: { rank: "asc" } } },
  });

  return (
    <div>
      <div className="card-soft mb-6 p-4">
        <h1 className="text-xl font-extrabold text-foreground">Raekwon</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          The chef of this job tracker — cooks up fresh, verified leads by searching this app&apos;s own
          job sources and the live internet, then reports on which sources performed best.
        </p>
      </div>

      <RaekwonPanel initialReport={report} initialLeads={report?.leads ?? []} />
    </div>
  );
}
