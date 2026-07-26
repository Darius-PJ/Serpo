import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireJsonRequest } from "@/lib/security/guard";
import { requireApiUserId } from "@/lib/auth/session";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claudeClient";

export const dynamic = "force-dynamic";

interface Suggestion {
  name: string;
  url: string;
  jurisdiction: "federal" | "state" | "municipal" | "other";
  region: string;
}

const SUGGESTION_SCHEMA = {
  type: "object" as const,
  properties: {
    suggestions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          url: { type: "string" as const },
          jurisdiction: { type: "string" as const, enum: ["federal", "state", "municipal", "other"] },
          region: { type: "string" as const },
        },
        required: ["name", "url", "jurisdiction", "region"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

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
    output_config: { effort: "low", format: { type: "json_schema", schema: SUGGESTION_SCHEMA } },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    system:
      "You find job boards and aggregators worth bookmarking for a job seeker — government " +
      "(federal/state/municipal) job sites, general and niche job aggregators, industry- or " +
      "profession-specific boards, and community/company-directory boards. Only suggest real, " +
      "currently-live sites you found via web search — never guess a URL from memory. Skip " +
      "anything you couldn't verify is live during this search. Use jurisdiction \"other\" for " +
      "anything that isn't a government job site.",
    messages: [
      {
        role: "user",
        content: `Find job boards or aggregators relevant to: ${query}. This could be a location (find government job sites there), an industry or profession, or a niche (e.g. nonprofit, startups, a specific skill). Return up to 5.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  let suggestions: Suggestion[] = [];
  try {
    const parsed = textBlock && "text" in textBlock ? JSON.parse(textBlock.text) : { suggestions: [] };
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  } catch {
    suggestions = [];
  }

  // De-dupe against boards already saved so the UI doesn't offer to re-add them.
  const fresh = suggestions.filter((s) => {
    try {
      return !knownUrls.has(new URL(s.url).toString().toLowerCase());
    } catch {
      return false;
    }
  });

  return NextResponse.json({ suggestions: fresh });
}
