export interface JobSearchCriteria {
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
}

export interface JobSearchResult {
  source: string;
  label: string;
  listings: NormalizedJobListing[];
  error?: string;
}
