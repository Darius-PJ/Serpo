import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { searchAllSources } from "@/lib/jobSources";
import { searchPoolBoards } from "@/lib/jobSources/searchPoolBoards";
import { dedupeListings } from "@/lib/jobSources/dedupe";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { generateRaekwonReport } from "@/lib/raekwon/generateReport";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;
const ALLOWED_BATCH_SIZES = [5, 10, 15];
const ALLOWED_JOB_TYPES = ["full-time", "contract"];

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const keyword = typeof body.keyword === "string" ? body.keyword.trim().slice(0, MAX_FIELD_LENGTH) : "";
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const batchSize = ALLOWED_BATCH_SIZES.includes(Number(body.batchSize)) ? Number(body.batchSize) : 10;
  const jobType = ALLOWED_JOB_TYPES.includes(body.jobType) ? (body.jobType as "full-time" | "contract") : undefined;
  const location = typeof body.location === "string" ? body.location.trim().slice(0, MAX_FIELD_LENGTH) || undefined : undefined;
  const compensationTarget =
    typeof body.compensationTarget === "string" ? body.compensationTarget.trim().slice(0, MAX_FIELD_LENGTH) || undefined : undefined;

  const report = await prisma.raekwonReport.create({
    data: { userId, batchSize, keyword, location, jobType, compensationTarget, status: "pending" },
  });

  const searchCriteria = { keywords: keyword, location, remoteOnly: false };
  const [staticResults, poolResults] = await Promise.all([
    searchAllSources(searchCriteria),
    searchPoolBoards(userId, searchCriteria),
  ]);
  const candidatePool = dedupeListings([...staticResults, ...poolResults].flatMap((g) => g.listings));

  try {
    const result = await generateRaekwonReport({ keyword, batchSize, location, jobType, compensationTarget }, candidatePool);

    const [updated, leads] = await prisma.$transaction([
      prisma.raekwonReport.update({
        where: { id: report.id },
        data: { status: "generated", sourcesHubMarkdown: result.sourcesHubMarkdown },
      }),
      prisma.raekwonLead.createManyAndReturn({
        data: result.leads.map((lead) => ({ ...lead, reportId: report.id })),
      }),
    ]);

    return NextResponse.json({ report: updated, leads }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await prisma.raekwonReport.update({
      where: { id: report.id },
      data: { status: "failed", error: message },
    });
    return NextResponse.json({ report: updated, leads: [] }, { status: 201 });
  }
}
