import { describe, it, expect } from "vitest";
import { BenchmarkResumeZ } from "@/lib/resume/benchmarkResumeSchema";

const valid = {
  contactHeader: "Alex Morgan · alex.morgan@example.com",
  summary: "Illustrative backend engineer candidate.",
  experience: [
    { employer: "Nova Systems", title: "Software Engineer", dates: "2021-2024", bullets: ["Built things"] },
  ],
  skills: ["TypeScript"],
  education: [{ institution: "State University", credential: "B.S. CS", dates: "2017-2021" }],
};

describe("BenchmarkResumeZ", () => {
  it("accepts a well-formed benchmark resume", () => {
    const result = BenchmarkResumeZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { summary, ...missingSummary } = valid;
    void summary;
    const result = BenchmarkResumeZ.safeParse(missingSummary);
    expect(result.success).toBe(false);
  });

  it("rejects an invented extra property (guards against schema drift from the model)", () => {
    const withExtra = { ...valid, fabricatedField: "should not be here" };
    const result = BenchmarkResumeZ.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects wrong types inside nested experience entries", () => {
    const bad = { ...valid, experience: [{ employer: "Nova Systems", title: "Engineer", dates: "2021", bullets: "not an array" }] };
    const result = BenchmarkResumeZ.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(BenchmarkResumeZ.safeParse(null).success).toBe(false);
    expect(BenchmarkResumeZ.safeParse("a string").success).toBe(false);
  });
});
