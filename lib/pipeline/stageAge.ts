const DAY_MS = 24 * 60 * 60 * 1000;

// Two weeks in one stage without movement is the point where a card deserves
// an amber nudge — same spirit as the 7-day follow-up and 3-month stale checks.
const STALE_STAGE_AGE_DAYS = 14;

export interface StageAge {
  days: number;
  label: string;
  stale: boolean;
}

/**
 * Whole days an application has sat in its current stage, for the board's
 * aging badges. `now` is passed in so server components stay pure and tests
 * stay deterministic; clock skew clamps to zero rather than going negative.
 */
export function describeStageAge(lastStatusChangeAt: Date, now: number): StageAge {
  const days = Math.max(0, Math.floor((now - lastStatusChangeAt.getTime()) / DAY_MS));
  return {
    days,
    label: days === 0 ? "today" : `${days}d in stage`,
    stale: days >= STALE_STAGE_AGE_DAYS,
  };
}
