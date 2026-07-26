import { z } from "zod";

export interface RaekwonLeadResult {
  company: string;
  role: string;
  location?: string;
  url: string;
  sourceLabel: string;
  jobType: "full-time" | "contract" | "unknown";
  compensation?: string;
  rationale: string;
}

export interface RaekwonReportResult {
  leads: RaekwonLeadResult[];
  sourcesHubMarkdown: string;
}

export const RaekwonReportZ = z
  .object({
    leads: z.array(
      z
        .object({
          company: z.string(),
          role: z.string(),
          location: z.string().optional(),
          url: z.string(),
          sourceLabel: z.string(),
          jobType: z.enum(["full-time", "contract", "unknown"]),
          compensation: z.string().optional(),
          rationale: z.string(),
        })
        .strict()
    ),
    sourcesHubMarkdown: z.string(),
  })
  .strict();

export class InvalidRaekwonReportError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid Raekwon report shape: ${details}`);
    this.name = "InvalidRaekwonReportError";
  }
}

export const RAEKWON_REPORT_SCHEMA = {
  type: "object" as const,
  properties: {
    leads: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          company: { type: "string" as const },
          role: { type: "string" as const },
          location: { type: "string" as const },
          url: { type: "string" as const },
          sourceLabel: { type: "string" as const },
          jobType: { type: "string" as const, enum: ["full-time", "contract", "unknown"] },
          compensation: { type: "string" as const },
          rationale: { type: "string" as const },
        },
        required: ["company", "role", "url", "sourceLabel", "jobType", "rationale"],
        additionalProperties: false,
      },
    },
    sourcesHubMarkdown: {
      type: "string" as const,
      description:
        "Markdown using only headers (#/##), bullet lists (-), bold (**text**), and links ([text](url)) — the UI renders a minimal parser, not a full markdown library.",
    },
  },
  required: ["leads", "sourcesHubMarkdown"],
  additionalProperties: false,
};
