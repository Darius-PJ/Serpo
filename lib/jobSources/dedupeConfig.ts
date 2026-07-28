// Configurable knobs for dedup clustering and per-source caching, read the
// same way as the rest of this codebase's "value with a sane default"
// settings (e.g. lib/jobSources/jobSpy.ts's `process.env.JOBSPY_PYTHON ||
// "python"`) rather than a boolean feature flag — see .env.example.

const DEFAULT_SIMILARITY_THRESHOLD = 0.9;
const DEFAULT_CACHE_TTL_MINUTES = 15;

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 0–1 SimHash similarity a pair of listings must meet to be clustered into the same job family. Default 0.90 (90%). */
export function getDedupSimilarityThreshold(): number {
  const value = parsePositiveFloat(process.env.DEDUP_SIMILARITY_THRESHOLD, DEFAULT_SIMILARITY_THRESHOLD);
  // Guard against an out-of-range env value silently disabling clustering
  // (>1) or matching everything (<=0).
  return value > 0 && value <= 1 ? value : DEFAULT_SIMILARITY_THRESHOLD;
}

/** How long a per-source cached result set stays fresh before a search re-fetches it. Default 15 minutes. */
export function getJobCacheTtlMinutes(): number {
  return parsePositiveFloat(process.env.JOB_CACHE_TTL_MINUTES, DEFAULT_CACHE_TTL_MINUTES);
}
