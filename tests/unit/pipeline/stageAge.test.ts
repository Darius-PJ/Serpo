import { describe, expect, it } from "vitest";
import { describeStageAge } from "@/lib/pipeline/stageAge";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("describeStageAge", () => {
  it("reports whole days in stage with a stale flag from 14 days", () => {
    const now = Date.now();
    expect(describeStageAge(new Date(now), now)).toEqual({ days: 0, label: "today", stale: false });
    expect(describeStageAge(new Date(now - 1 * DAY_MS), now)).toEqual({ days: 1, label: "1d in stage", stale: false });
    expect(describeStageAge(new Date(now - 13.5 * DAY_MS), now)).toEqual({ days: 13, label: "13d in stage", stale: false });
    expect(describeStageAge(new Date(now - 14 * DAY_MS), now)).toEqual({ days: 14, label: "14d in stage", stale: true });
  });

  it("never reports negative ages when clocks disagree", () => {
    const now = Date.now();
    expect(describeStageAge(new Date(now + DAY_MS), now)).toEqual({ days: 0, label: "today", stale: false });
  });
});
