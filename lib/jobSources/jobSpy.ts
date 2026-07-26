import { spawn } from "node:child_process";
import path from "node:path";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

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

function runPythonScript(scriptPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = process.env.JOBSPY_PYTHON || "python";
    const child = spawn(python, [scriptPath, ...args]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`jobspy_search.py exited ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

export const jobSpyConnector: JobSourceConnector = {
  key: "jobspy",
  label: "JobSpy (LinkedIn/Indeed/Glassdoor/ZipRecruiter/Google)",

  isConfigured() {
    // Always on, per explicit user direction — JobSpy scrapes sites like
    // LinkedIn/Indeed whose Terms of Service restrict automated scraping,
    // which is worth knowing, but the person running this app has made that
    // call themselves. If python-jobspy isn't installed on this machine,
    // that surfaces as a normal per-source error (below), not a hard crash.
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const scriptPath = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "jobspy_search.py");
    const args = ["--keywords", criteria.keywords];
    if (criteria.location) args.push("--location", criteria.location);
    if (criteria.remoteOnly) args.push("--remote-only");

    const stdout = await runPythonScript(scriptPath, args);
    const results = JSON.parse(stdout) as JobSpyRawResult[];

    return results
      .filter((r) => r.job_url)
      .map((r): NormalizedJobListing => ({
        id: `jobspy:${r.site}:${r.id ?? r.job_url}`,
        source: "jobspy",
        company: r.company ?? "Unknown",
        role: r.title,
        location: r.location,
        url: r.job_url,
        postedAt: r.date_posted,
        description: r.description,
      }));
  },
};
