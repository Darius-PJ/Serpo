import { z } from "zod";

// A third distinct type/schema alongside lib/apply/resumeSchema.ts's
// TailoredResume (never fabricate — real applications) and
// benchmarkResumeSchema.ts's BenchmarkResume (fabrication is the point —
// fully fictional competitor). This one sits in between: grounded in the
// user's own real uploaded resume, allowed to elaborate and flesh out real
// experience and add highly-plausible implied skills, but never invent a
// new employer, title, date range, or credential. Never used for a real
// application — illustrative/practice only, like BenchmarkResume.
export interface ImprovedResume {
  contactHeader: string;
  summary: string;
  experience: { employer: string; title: string; dates: string; bullets: string[] }[];
  skills: string[];
  education: { institution: string; credential: string; dates: string }[];
}

export const ImprovedResumeZ = z
  .object({
    contactHeader: z.string(),
    summary: z.string(),
    experience: z.array(
      z
        .object({
          employer: z.string(),
          title: z.string(),
          dates: z.string(),
          bullets: z.array(z.string()),
        })
        .strict()
    ),
    skills: z.array(z.string()),
    education: z.array(
      z
        .object({
          institution: z.string(),
          credential: z.string(),
          dates: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export class InvalidImprovedResumeError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid improved resume shape: ${details}`);
    this.name = "InvalidImprovedResumeError";
  }
}

export const IMPROVED_RESUME_SCHEMA = {
  type: "object" as const,
  properties: {
    contactHeader: { type: "string" as const },
    summary: { type: "string" as const },
    experience: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          employer: { type: "string" as const },
          title: { type: "string" as const },
          dates: { type: "string" as const },
          bullets: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["employer", "title", "dates", "bullets"],
        additionalProperties: false,
      },
    },
    skills: { type: "array" as const, items: { type: "string" as const } },
    education: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          institution: { type: "string" as const },
          credential: { type: "string" as const },
          dates: { type: "string" as const },
        },
        required: ["institution", "credential", "dates"],
        additionalProperties: false,
      },
    },
  },
  required: ["contactHeader", "summary", "experience", "skills", "education"],
  additionalProperties: false,
};
