// Spawns scripts/jobspy_search.py (python-jobspy) and parses its JSON stdout.
// The worst outlier among the migrated sources (Python subprocess, ~90s latency,
// per-board partial failure); the legacy lib/jobSources/jobSpy.ts path it
// replaced was removed in Phase 5.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";
import { JOBSPY_BOARDS, type JobSpySite } from "@/lib/jobSpyBoards";
import { positiveSetting, scheduleScrape } from "../../services/scrapeScheduler";

interface JobSpyRawResult {
  site: string;
  id?: string;
  company?: string;
  title: string;
  location?: string;
  job_url: string;
  date_posted?: string;
  description?: string;
}

interface BoardResult {
  site: JobSpySite;
  items: JobSpyRawResult[];
  status: "ok" | "rate-limited" | "blocked" | "invalid-request" | "error";
  details: string;
  retryAfterSeconds: number;
}

function failureMessage(result: BoardResult): string {
  switch (result.status) {
    case "rate-limited": return "Rate limited or challenged by this board (429). Requests are paused.";
    case "blocked": return "Access denied by this board (403). Requests are paused.";
    case "invalid-request": return "The board rejected the request or location lookup (400). Check the location; requests are paused.";
    default: return "This board could not complete its search. Requests are paused.";
  }
}

// JOBSPY_PYTHON wins; without it, the conventional venv the installer's
// background provisioning creates (scripts/setupJobSpy.ps1) is probed before
// falling back to whatever "python" resolves to on PATH.
function jobSpyPython(): string {
  if (process.env.JOBSPY_PYTHON) return process.env.JOBSPY_PYTHON;
  const venvPython = path.join(
    process.cwd(),
    ".venv-jobspy",
    ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]),
  );
  if (existsSync(venvPython)) return venvPython;
  return "python";
}

// python-jobspy is a runtime dependency package.json can't see — probe for it so
// a missing package reads as "unconfigured" (excluded from search, like an adapter
// missing its API key) instead of failing every search and tripping the circuit
// breaker. find_spec avoids importing jobspy (and its pandas chain), so the probe
// costs one ~100ms interpreter start. A positive result is cached for the life of
// the server process; a negative one expires so the installer's background
// provisioning is noticed without a restart.
const NEGATIVE_PROBE_TTL_MS = 5 * 60_000;
let probeResult: boolean | null = null;
let probeCheckedAt = 0;
function isPythonJobSpyInstalled(): boolean {
  const now = Date.now();
  if (probeResult === null || (probeResult === false && now - probeCheckedAt > NEGATIVE_PROBE_TTL_MS)) {
    const probe = spawnSync(jobSpyPython(), ["-c", "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('jobspy') else 1)"], {
      timeout: 15_000,
      windowsHide: true,
    });
    probeResult = probe.status === 0;
    probeCheckedAt = now;
  }
  return probeResult;
}

// Test-only: clears the cached probe between test cases.
export function resetJobSpyProbeForTests(): void {
  probeResult = null;
  probeCheckedAt = 0;
}

function runPythonScript(scriptPath: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(jobSpyPython(), [scriptPath, ...args], { signal, windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-8000)));

    child.on("error", (err) => {
      if (err.name === "AbortError") reject(new Error("jobspy_search.py timed out"));
      else reject(err);
    });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`jobspy_search.py exited ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}

function createJobSpyAdapter(site: JobSpySite, label: string): Adapter<JobSpyRawResult> {
return {
  metadata: {
    id: `jobspy:${site}`,
    displayName: label,
    homepage: "https://github.com/speedyapply/JobSpy",
    tosNotes:
      "Uses JobSpy to scrape this board. Automated access may be restricted by the board's terms.",
    sourceKind: "scraped-board",
  },
  capabilities: {
    supportsKeywordQuery: true,
    supportsLocationFilter: true,
    supportsRemoteFilter: true,
    supportsDateFilter: false,
    supportsSalaryFilter: false,
    queryModel: "keyword-search",
    paginationStyle: "none",
    requiresDetailFetch: false,
    runtime: "subprocess",
    cost: { tier: "free" },
    latencyClass: "very-slow",
    cacheable: true,
    cacheTtlSeconds: 900,
    tosForbidsStorage: false,
    maxConcurrency: 1,
  },
  configSchema: [],
  isConfigured: () => isPythonJobSpyInstalled(),

  async healthCheck() {
    // A real check would spawn the full script — too expensive for a "cheap
    // liveness probe" on a subprocess-backed, very-slow adapter. The cached
    // dependency probe is the only meaningful signal available without paying
    // the full search cost.
    return isPythonJobSpyInstalled()
      ? { ok: true }
      : { ok: false, detail: "python-jobspy is not installed for the probed interpreter — pip install python-jobspy, or point JOBSPY_PYTHON at an interpreter that has it" };
  },

  async *search(query, ctx): AsyncGenerator<AdapterPage<JobSpyRawResult>> {
    if (query.kind !== "keywords") throw new Error("jobspy requires a keyword query");

    const scriptPath = path.join(process.cwd(), "scripts", "jobspy_search.py");
    const args = ["--site", site, "--keywords", query.keywords,
      "--results-wanted", String(Math.min(25, Math.floor(positiveSetting("JOBSPY_RESULTS_WANTED", 10)))),
      "--request-delay", String(positiveSetting("JOBSPY_REQUEST_DELAY_SECONDS", 3))];
    if (query.location) args.push("--location", query.location);
    if (query.remoteOnly) args.push("--remote-only");

    const result = await scheduleScrape<BoardResult>({
      site, key: JSON.stringify(query), signal: ctx.signal,
      minIntervalMs: positiveSetting(site === "google" ? "JOBSPY_GOOGLE_INTERVAL_SECONDS" : "JOBSPY_MIN_INTERVAL_SECONDS", site === "google" ? 900 : 60) * 1000,
      run: async () => {
        try {
          const parsed = JSON.parse(await runPythonScript(scriptPath, args, ctx.signal)) as BoardResult;
          if (parsed.site !== site || !Array.isArray(parsed.items) || !["ok", "rate-limited", "blocked", "invalid-request", "error"].includes(parsed.status)) throw new Error("Invalid response from JobSpy helper");
          return parsed;
        } catch (error) {
          return { site, items: [], status: "error", details: error instanceof Error ? error.message : String(error), retryAfterSeconds: 0 };
        }
      },
      cooldown: (response) => response.status === "ok" ? null : {
        milliseconds: Math.max(positiveSetting("JOBSPY_FAILURE_COOLDOWN_SECONDS", 1800), Number.isFinite(response.retryAfterSeconds) ? response.retryAfterSeconds : 0) * 1000,
        reason: failureMessage(response),
      },
    });
    const items = result.items.filter((r) => r.job_url && r.site === site);
    if (result.status !== "ok") {
      ctx.logger.warn("JobSpy board failed", { site, status: result.status, details: result.details });
      if (!items.length) throw Object.assign(new Error(failureMessage(result)), { details: result.details });
    }
    yield { items, nextCursor: null, partial: result.status !== "ok",
      warning: result.status === "ok" ? undefined : failureMessage(result),
      details: result.status === "ok" ? undefined : result.details };
  },

  normalize(r, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: `jobspy:${site}`,
      sourceJobId: r.id ?? r.job_url,
      idIsDerived: !r.id,
      canonicalUrl: r.job_url,
      applyUrl: null,
      title: r.title,
      company: r.company ?? null,
      descriptionHtml: null,
      descriptionText: r.description ?? null,
      postedAt: r.date_posted ?? null,
      fetchedAt: ctx.fetchedAt,
      location: { raw: r.location ?? null, remote: null, country: null, region: null, city: null },
      compensation: { min: null, max: null, currency: null, period: null, isEstimate: false },
      employment: { type: null, seniorityHint: null },
      provenance: { sourceKind: "scraped-board", posterIsLikelyAgency: null, originalSourceUrl: null },
      raw: r,
    };
  },
};
}

export const jobSpyAdapters = JOBSPY_BOARDS.map(({ site, label }) => createJobSpyAdapter(site, label));
