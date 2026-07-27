import { z } from "zod";

// Deliberately a separate type/schema from lib/apply/resumeSchema.ts's
// TailoredResume, even though the shape matches — that one represents the
// user's own résumé and must never contain fabricated content; this one is
// explicitly synthetic and illustrative by design. Keeping them distinct
// files/types stops the two "never fabricate" vs "fabrication is the point"
// code paths from ever being confused with each other.
export interface BenchmarkResume {
  contactHeader: string;
  summary: string;
  experience: { employer: string; title: string; dates: string; bullets: string[] }[];
  skills: string[];
  education: { institution: string; credential: string; dates: string }[];
}

export const BenchmarkResumeZ = z
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

export class InvalidBenchmarkResumeError extends Error {
  constructor(details: string) {
    super(`Claude returned an invalid benchmark resume shape: ${details}`);
    this.name = "InvalidBenchmarkResumeError";
  }
}

export const BENCHMARK_RESUME_SCHEMA = {
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
