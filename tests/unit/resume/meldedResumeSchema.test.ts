import { describe, it, expect } from "vitest";
import { MeldedResumeZ } from "@/lib/resume/meldedResumeSchema";

const valid = {
  contactHeader: "Jordan Lee · jordan.lee@example.com",
  summary: "Backend engineer growing toward a senior platform role.",
  experience: [
    { employer: "Acme Corp", title: "Software Engineer", dates: "2021-2025", bullets: ["Built REST APIs in Node.js"] },
  ],
  skills: ["Node.js", "TypeScript", "Kubernetes (growth target)"],
  education: [{ institution: "State University", credential: "B.S. CS", dates: "2017-2021" }],
};

describe("MeldedResumeZ", () => {
  it("accepts a well-formed melded resume", () => {
    const result = MeldedResumeZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { skills, ...missingSkills } = valid;
    void skills;
    const result = MeldedResumeZ.safeParse(missingSkills);
    expect(result.success).toBe(false);
  });

  it("rejects an invented extra property (guards against schema drift from the model)", () => {
    const withExtra = { ...valid, fabricatedField: "should not be here" };
    const result = MeldedResumeZ.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects wrong types inside nested education entries", () => {
    const bad = { ...valid, education: [{ institution: "State University", credential: "B.S. CS" }] };
    const result = MeldedResumeZ.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(MeldedResumeZ.safeParse(null).success).toBe(false);
    expect(MeldedResumeZ.safeParse("a string").success).toBe(false);
  });
});
