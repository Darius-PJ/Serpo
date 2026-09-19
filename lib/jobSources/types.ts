export interface JobSearchCriteria {
  jobSpySites?: string[];
  keywords: string;
  location?: string;
  remoteOnly?: boolean;
}

export interface NormalizedJobListing {
  /** Stable id, prefixed by source, e.g. "adzuna:123456" */
  id: string;
  source: string;
  company: string;
  role: string;
  location?: string;
  /** Direct link to the original posting — required so results can be opened straight from search. */
  url: string;
  postedAt?: string;
  description?: string;
  /** Search-relevance tier (lib/jobSources/titleMatch.ts) — set by the search
   * route so the UI can group family matches separately. Absent tiers render
   * as primary matches. */
  relevance?: "exact" | "strong" | "alias" | "family";
}

export interface JobSearchResult {
  source: string;
  label: string;
  listings: NormalizedJobListing[];
  error?: string;
  errorDetails?: string;
}
