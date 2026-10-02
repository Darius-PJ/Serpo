import { describe, expect, it } from "vitest";
import { currentSlot, localDateKey, nextSlotAfter } from "@/lib/automation/slots";

const HOUR_MS = 60 * 60 * 1000;
const NEW_YORK = "America/New_York";

describe("cadence slots", () => {
  it("keeps daily slots at local midnight across both DST changes, 23 h and 25 h apart", () => {
    // 2026-03-08: 02:00 EST jumps to 03:00 EDT. Midnight is 05:00Z before, 04:00Z after.
    const springMidnight = currentSlot(new Date("2026-03-08T15:00:00Z"), "daily", NEW_YORK);
    const afterSpring = nextSlotAfter(springMidnight, "daily", NEW_YORK);
    expect(springMidnight).toEqual(new Date("2026-03-08T05:00:00Z"));
    expect(afterSpring).toEqual(new Date("2026-03-09T04:00:00Z"));
    expect(afterSpring.getTime() - springMidnight.getTime()).toBe(23 * HOUR_MS);

    // 2026-11-01: 02:00 EDT falls back to 01:00 EST. Midnight is 04:00Z before, 05:00Z after.
    const fallMidnight = currentSlot(new Date("2026-11-01T15:00:00Z"), "daily", NEW_YORK);
    const afterFall = nextSlotAfter(fallMidnight, "daily", NEW_YORK);
    expect(fallMidnight).toEqual(new Date("2026-11-01T04:00:00Z"));
    expect(afterFall).toEqual(new Date("2026-11-02T05:00:00Z"));
    expect(afterFall.getTime() - fallMidnight.getTime()).toBe(25 * HOUR_MS);
  });

  it("aligns every_6h slots to the local clock, so the window spanning a DST change is 5 h or 7 h", () => {
    // 00:00 EST to 06:00 EDT: 05:00Z to 10:00Z.
    expect(nextSlotAfter(new Date("2026-03-08T05:00:00Z"), "every_6h", NEW_YORK)).toEqual(new Date("2026-03-08T10:00:00Z"));
    expect(currentSlot(new Date("2026-03-08T09:59:00Z"), "every_6h", NEW_YORK)).toEqual(new Date("2026-03-08T05:00:00Z"));

    // 00:00 EDT to 06:00 EST: 04:00Z to 11:00Z.
    expect(nextSlotAfter(new Date("2026-11-01T04:00:00Z"), "every_6h", NEW_YORK)).toEqual(new Date("2026-11-01T11:00:00Z"));
    expect(currentSlot(new Date("2026-11-01T10:59:00Z"), "every_6h", NEW_YORK)).toEqual(new Date("2026-11-01T04:00:00Z"));
  });

  it("moves a midnight the DST jump skips to the first local time that exists", () => {
    // Havana springs forward at midnight on 2026-03-08: 23:59 CST is followed by 01:00 CDT (05:00Z).
    const havana = "America/Havana";
    expect(nextSlotAfter(new Date("2026-03-07T12:00:00Z"), "daily", havana)).toEqual(new Date("2026-03-08T05:00:00Z"));
    expect(currentSlot(new Date("2026-03-08T12:00:00Z"), "daily", havana)).toEqual(new Date("2026-03-08T05:00:00Z"));
    // One minute earlier it is still 2026-03-07 in Havana, whose slot came a day before.
    expect(currentSlot(new Date("2026-03-08T04:59:00Z"), "daily", havana)).toEqual(new Date("2026-03-07T05:00:00Z"));
  });

  it("skips weekends for weekdays: Saturday belongs to Friday's slot and the next is Monday's", () => {
    const saturdayMorning = new Date("2026-10-03T12:00:00Z");
    expect(currentSlot(saturdayMorning, "weekdays", NEW_YORK)).toEqual(new Date("2026-10-02T04:00:00Z"));
    expect(nextSlotAfter(saturdayMorning, "weekdays", NEW_YORK)).toEqual(new Date("2026-10-05T04:00:00Z"));
  });

  it("names the day and the daily slot in the given zone: one instant, two local dates", () => {
    // 20:00Z is 05:00 on June 16 in Tokyo and 13:00 on June 15 in Los Angeles.
    const instant = new Date("2026-06-15T20:00:00Z");
    expect(currentSlot(instant, "daily", "Asia/Tokyo")).toEqual(new Date("2026-06-15T15:00:00Z"));
    expect(localDateKey(instant, "Asia/Tokyo")).toBe("2026-06-16");
    expect(currentSlot(instant, "daily", "America/Los_Angeles")).toEqual(new Date("2026-06-15T07:00:00Z"));
    expect(localDateKey(instant, "America/Los_Angeles")).toBe("2026-06-15");
  });
});
