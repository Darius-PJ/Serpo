import { describe, expect, it } from "vitest";
import { calculatePipelineMetrics } from "@/lib/dashboard/metrics";

describe("calculatePipelineMetrics", () => {
  it("derives funnel, stage age, weekly activity, and source effectiveness from CRM history", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const metrics = calculatePipelineMetrics(
      [
        { id: "a1", source: "referral", status: "Interviewing", appliedAt: new Date("2026-08-20"), lastStatusChangeAt: new Date("2026-08-29") },
        { id: "a2", source: "job-board", status: "Sourced", appliedAt: null, lastStatusChangeAt: new Date("2026-08-22") },
        { id: "a3", source: "referral", status: "Offer", appliedAt: new Date("2026-08-01"), lastStatusChangeAt: new Date("2026-08-30") },
        { id: "a4", source: "job-board", status: "Rejected", appliedAt: new Date("2026-07-01"), lastStatusChangeAt: new Date("2026-08-01") },
      ],
      [
        { applicationId: "a1", to: "Interviewing", at: new Date("2026-08-28") },
        { applicationId: "a3", to: "Interviewing", at: new Date("2026-08-10") },
        { applicationId: "a3", to: "Offer", at: new Date("2026-08-30") },
        { applicationId: "a4", to: "Rejected", at: new Date("2026-08-01") },
      ],
      now,
    );

    expect(metrics.funnel).toEqual({ tracked: 4, submitted: 3, interviewed: 2, offers: 1 });
    expect(metrics.submissionRate).toBe(75);
    expect(metrics.interviewRate).toBeCloseTo(66.7, 1);
    expect(metrics.medianCurrentStageDays).toBe(3);
    expect(metrics.weeklyStatusChanges).toBe(2);
    expect(metrics.sources[0]).toMatchObject({ source: "referral", applications: 2, interviews: 2, interviewRate: 100 });
  });
});
