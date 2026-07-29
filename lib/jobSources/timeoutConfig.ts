// Configurable per-call timeout for job-source network calls. A source that
// never resolves would otherwise hang the entire search — Promise.all in
// index.ts/searchPoolBoards.ts only settles once every connector settles —
// so every connector aborts itself past this deadline. That turns a hang
// into a normal rejection, which the existing per-connector try/catch
// already isolates to just that one source's result group.
function readPositiveMs(envVar: string, fallback: number): number {
  const raw = Number(process.env[envVar]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function getSourceFetchTimeoutMs(): number {
  return readPositiveMs("JOB_SOURCE_TIMEOUT_MS", 15_000);
}

// JobSpy spawns a Python subprocess that scrapes five sites in one call —
// far slower than a single JSON API request, so it gets its own, longer budget.
export function getJobSpyTimeoutMs(): number {
  return readPositiveMs("JOBSPY_TIMEOUT_MS", 90_000);
}
