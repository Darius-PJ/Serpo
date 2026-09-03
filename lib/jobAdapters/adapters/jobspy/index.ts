// Spawns scripts/jobspy_search.py (python-jobspy) and parses its JSON stdout.
// The worst outlier among the migrated sources (Python subprocess, ~90s latency,
// per-board partial failure); the legacy lib/jobSources/jobSpy.ts path it
// replaced was removed in Phase 5.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Adapter, AdapterPage, NormalizedJobListing, NormalizeContext } from "../../types";

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

const REQUESTED_SITES = ["indeed", "linkedin", "zip_recruiter", "glassdoor", "google"];

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
    const child = spawn(jobSpyPython(), [scriptPath, ...args], { signal });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

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

export const jobSpyAdapter: Adapter<JobSpyRawResult> = {
  metadata: {
    id: "jobspy",
    displayName: "JobSpy (LinkedIn/Indeed/Glassdoor/ZipRecruiter/Google)",
    homepage: "https://github.com/speedyapply/JobSpy",
    tosNotes:
      "Scrapes sites (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google) whose Terms of Service restrict automated access. Always-on, no separate opt-in flag — a call the person running this tool has already made (see scripts/jobspy_search.py's docstring).",
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
    const args = ["--keywords", query.keywords];
    if (query.location) args.push("--location", query.location);
    if (query.remoteOnly) args.push("--remote-only");

    const stdout = await runPythonScript(scriptPath, args, ctx.signal);
    const results = JSON.parse(stdout) as JobSpyRawResult[];
    const items = results.filter((r) => r.job_url);

    // Per-board partial-failure accounting (docs/adapter-interface.md 2d, outlier #3):
    // python-jobspy scrapes all 5 requested sites in one call, with no per-site error
    // surfaced to Node today. This is the one honest signal available without
    // changing jobspy_search.py itself: a requested site with zero matching items.
    // Can't distinguish "that site had no real matches" from "that site's scrape
    // actually failed" — flagged as an open question in docs/architecture-audit.md,
    // not resolved here.
    const sitesRepresented = new Set(items.map((r) => r.site));
    const missingSites = REQUESTED_SITES.filter((site) => !sitesRepresented.has(site));
    if (missingSites.length > 0) {
      ctx.logger.warn("one or more requested sites had zero results (may be a real scrape failure, unverifiable from Node)", { missingSites });
    }

    yield { items, nextCursor: null, partial: missingSites.length > 0 };
  },

  normalize(r, ctx: NormalizeContext): NormalizedJobListing {
    return {
      schemaVersion: 1,
      sourceId: "jobspy",
      sourceJobId: `${r.site}:${r.id ?? r.job_url}`,
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
