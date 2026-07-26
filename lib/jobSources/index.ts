import { adzunaConnector } from "./adzuna";
import { arbeitnowConnector } from "./arbeitnow";
import { himalayasConnector } from "./himalayas";
import { jobicyConnector } from "./jobicy";
import { jobSpyConnector } from "./jobSpy";
import { joobleConnector } from "./jooble";
import { remoteOkConnector } from "./remoteOk";
import { remotiveConnector } from "./remotive";
import { usaJobsConnector } from "./usaJobs";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// Add a new source by implementing JobSourceConnector and registering it here —
// nothing else in the app needs to change.
const CONNECTORS: JobSourceConnector[] = [
  usaJobsConnector,
  adzunaConnector,
  joobleConnector,
  remoteOkConnector,
  remotiveConnector,
  himalayasConnector,
  jobicyConnector,
  arbeitnowConnector,
  jobSpyConnector,
];

export interface JobSearchResult {
  source: string;
  label: string;
  listings: NormalizedJobListing[];
  error?: string;
}

export async function searchAllSources(criteria: JobSearchCriteria): Promise<JobSearchResult[]> {
  const configured = CONNECTORS.filter((c) => c.isConfigured());

  return Promise.all(
    configured.map(async (connector): Promise<JobSearchResult> => {
      try {
        const listings = await connector.search(criteria);
        return { source: connector.key, label: connector.label, listings };
      } catch (err) {
        return {
          source: connector.key,
          label: connector.label,
          listings: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );
}

export { CONNECTORS as jobSourceConnectors };
export type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";
