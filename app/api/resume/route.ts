import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { generateBenchmarkResume } from "@/lib/resume/generateBenchmarkResume";
import { generateImprovedResume } from "@/lib/resume/generateImprovedResume";
import { serializeWorkspace } from "@/lib/resume/serializeWorkspace";

export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 10_000;
const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json().catch(() => ({}));
  const company = typeof body.company === "string" ? body.company.trim().slice(0, MAX_FIELD_LENGTH) : "";
  const role = typeof body.role === "string" ? body.role.trim().slice(0, MAX_FIELD_LENGTH) : "";
  if (!company || !role) {
    return NextResponse.json({ error: "company and role are required" }, { status: 400 });
  }
  const jobDescription =
    typeof body.jobDescription === "string" ? body.jobDescription.slice(0, MAX_DESCRIPTION_LENGTH) : undefined;
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.slice(0, 1000) : undefined;
  const originSearchQuery =
    typeof body.originSearchQuery === "string" ? body.originSearchQuery.slice(0, 1000) : undefined;

  const workspace = await prisma.resumeWorkspace.create({
    data: { userId, company, role, jobDescription, sourceUrl, originSearchQuery, benchmarkStatus: "pending" },
  });

  // Only attempt the improved resume if the account already has a resume on
  // file — otherwise it stays "not_started" until the user uploads one.
  const template = await prisma.resumeTemplate.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

  const [benchmarkResult, improvedResult] = await Promise.allSettled([
    generateBenchmarkResume(company, role, jobDescription),
    template
      ? generateImprovedResume(template.contentText, company, role, jobDescription)
      : Promise.reject(new Error("no resume template uploaded yet")),
  ]);

  const data: Record<string, unknown> = {};
  if (benchmarkResult.status === "fulfilled") {
    data.benchmarkStatus = "generated";
    data.benchmarkContent = JSON.stringify(benchmarkResult.value);
    data.benchmarkError = null;
  } else {
    data.benchmarkStatus = "failed";
    data.benchmarkError = benchmarkResult.reason instanceof Error ? benchmarkResult.reason.message : String(benchmarkResult.reason);
  }

  if (template) {
    if (improvedResult.status === "fulfilled") {
      data.improvedStatus = "generated";
      data.improvedContent = JSON.stringify(improvedResult.value);
      data.improvedError = null;
    } else {
      data.improvedStatus = "failed";
      data.improvedError = improvedResult.reason instanceof Error ? improvedResult.reason.message : String(improvedResult.reason);
    }
  }

  const updated = await prisma.resumeWorkspace.update({ where: { id: workspace.id }, data });
  return NextResponse.json({ workspace: serializeWorkspace(updated) }, { status: 201 });
}
