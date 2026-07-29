import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// USAJobs API docs: https://developer.usajobs.gov/api-reference/get-api-search
interface UsaJobsSearchResultItem {
  MatchedObjectDescriptor: {
    PositionID: string;
    PositionTitle: string;
    PositionURI: string;
    OrganizationName: string;
    PositionLocationDisplay?: string;
    PublicationStartDate?: string;
    UserArea?: { Details?: { JobSummary?: string } };
  };
}

interface UsaJobsResponse {
  SearchResult: { SearchResultItems: UsaJobsSearchResultItem[] };
}

export const usaJobsConnector: JobSourceConnector = {
  key: "usajobs",
  label: "USAJobs",

  isConfigured() {
    return Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_USER_AGENT);
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const params = new URLSearchParams({ Keyword: criteria.keywords });
    if (criteria.location) params.set("LocationName", criteria.location);
    if (criteria.remoteOnly) params.set("RemoteIndicator", "true");

    const res = await fetch(`https://data.usajobs.gov/api/search?${params.toString()}`, {
      headers: {
        Host: "data.usajobs.gov",
        "User-Agent": process.env.USAJOBS_USER_AGENT!,
        "Authorization-Key": process.env.USAJOBS_API_KEY!,
      },
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });

    if (!res.ok) {
      throw new Error(`USAJobs search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as UsaJobsResponse;
    return data.SearchResult.SearchResultItems.map((item): NormalizedJobListing => {
      const d = item.MatchedObjectDescriptor;
      return {
        id: `usajobs:${d.PositionID}`,
        source: "usajobs",
        company: d.OrganizationName,
        role: d.PositionTitle,
        location: d.PositionLocationDisplay,
        url: d.PositionURI,
        postedAt: d.PublicationStartDate,
        description: d.UserArea?.Details?.JobSummary,
      };
    });
  },
};
