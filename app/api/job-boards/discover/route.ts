import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";

export const dynamic = "force-dynamic";

// "The Gatherer" — looks for new "seeds" (job boards/aggregators of any
// flavor, government training-to-hire programs, and government IT-contract
// opportunity leads) worth surfacing. Every finding still requires a live
// web_search verification (never invented from memory), same safety property
// this endpoint has always had — the only behavior change is what happens
// after a find, handled by /api/job-boards/gather/integration-guide instead
// of a silent direct-add.
interface GathererFind {
  name: string;
  url: string;
  category: "jobBoard" | "trainingProgram" | "govOpportunity";
  description: string;
}

const FIND_SCHEMA = {
  type: "object" as const,
  properties: {
    finds: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          url: { type: "string" as const },
          category: { type: "string" as const, enum: ["jobBoard", "trainingProgram", "govOpportunity"] },
          description: { type: "string" as const, description: "one short sentence on what this is" },
        },
        required: ["name", "url", "category", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["finds"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You are a gatherer of job-search resources for a job seeker. Search for and verify three " +
  "kinds of finds, tagging each with the right category:\n" +
  '- "jobBoard": general or niche job aggregators, industry/profession-specific boards, ' +
  "government (federal/state/municipal) job listing sites, or community/company-directory boards.\n" +
  '- "trainingProgram": named, real, currently-active government-run training-to-hire or ' +
  "workforce-development programs (e.g. digital service fellowships, apprenticeships, IT " +
  "bootcamp-to-hire pipelines).\n" +
  '- "govOpportunity": named, real, currently-posted government IT-modernization contract or ' +
  "opportunity listings (e.g. an agency digital-service team's openings, a published " +
  "RFP/contract-opportunity board).\n" +
  "Only report something you found and verified is real and currently live via web search — " +
  "never invent a URL, a program name, or an opportunity from memory or speculation. Skip " +
  "anything you couldn't verify live during this search.";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;

  const userId = await requireApiUserId();
  if (userId instanceof NextResponse) return userId;

  const body = await request.json();
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const known = await prisma.jobBoard.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    select: { url: true },
  });
  const knownUrls = new Set(known.map((b) => b.url.toLowerCase()));

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: FIND_SCHEMA } },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Gather resources relevant to: ${query}. This could be a location, an industry/profession, or a niche. Return up to 6 finds across the three categories, whichever are genuinely relevant.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  let finds: GathererFind[] = [];
  try {
    const parsed = textBlock && "text" in textBlock ? JSON.parse(textBlock.text) : { finds: [] };
    finds = Array.isArray(parsed.finds) ? parsed.finds : [];
  } catch {
    finds = [];
  }

  // De-dupe against boards already saved so the UI doesn't re-surface them.
  const fresh = finds.filter((f) => {
    try {
      return !knownUrls.has(new URL(f.url).toString().toLowerCase());
    } catch {
      return false;
    }
  });

  return NextResponse.json({ finds: fresh });
}
