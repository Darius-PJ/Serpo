import { describe, it, expect } from "vitest";
import { TailoredResumeZ } from "@/lib/apply/resumeSchema";

const valid = {
  contactHeader: "Jane Doe · jane@example.com",
  summary: "Backend engineer.",
  experience: [
    { employer: "Acme", title: "Engineer", dates: "2020-2024", bullets: ["Built things"] },
  ],
  skills: ["TypeScript"],
  education: [{ institution: "State U", credential: "B.S. CS", dates: "2016-2020" }],
};

describe("TailoredResumeZ", () => {
  it("accepts a well-formed tailored resume", () => {
    const result = TailoredResumeZ.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { summary, ...missingSummary } = valid;
    void summary;
    const result = TailoredResumeZ.safeParse(missingSummary);
    expect(result.success).toBe(false);
  });

  it("rejects an invented extra property (guards against schema drift from the model)", () => {
    const withExtra = { ...valid, fabricatedField: "should not be here" };
    const result = TailoredResumeZ.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects wrong types inside nested experience entries", () => {
    const bad = { ...valid, experience: [{ employer: "Acme", title: "Engineer", dates: "2020", bullets: "not an array" }] };
    const result = TailoredResumeZ.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects completely malformed input", () => {
    expect(TailoredResumeZ.safeParse(null).success).toBe(false);
    expect(TailoredResumeZ.safeParse("a string").success).toBe(false);
  });
});
