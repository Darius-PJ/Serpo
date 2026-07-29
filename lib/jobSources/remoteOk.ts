import { getSourceFetchTimeoutMs } from "./timeoutConfig";
import type { JobSearchCriteria, JobSourceConnector, NormalizedJobListing } from "./types";

// RemoteOK public feed: https://remoteok.com/api
// No API key. The first array element is a legal/attribution notice, not a listing.
interface RemoteOkItem {
  id?: string;
  company?: string;
  position?: string;
  tags?: string[];
  url?: string;
  date?: string;
  description?: string;
  location?: string;
}

export const remoteOkConnector: JobSourceConnector = {
  key: "remoteok",
  label: "RemoteOK",

  isConfigured() {
    // Public feed — always available.
    return true;
  },

  async search(criteria: JobSearchCriteria): Promise<NormalizedJobListing[]> {
    const res = await fetch("https://remoteok.com/api", {
      headers: {
        // RemoteOK blocks requests without a descriptive User-Agent.
        "User-Agent": "job-tracker/1.0 (personal use, local-only)",
      },
      signal: AbortSignal.timeout(getSourceFetchTimeoutMs()),
    });

    if (!res.ok) {
      throw new Error(`RemoteOK search failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as RemoteOkItem[];
    const keywords = criteria.keywords.toLowerCase();

    return data
      .filter((item): item is Required<Pick<RemoteOkItem, "id" | "position" | "url">> & RemoteOkItem =>
        Boolean(item.id && item.position && item.url)
      )
      .filter((item) => {
        const haystack = [item.position, item.company, ...(item.tags ?? [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keywords);
      })
      .map((item): NormalizedJobListing => ({
        id: `remoteok:${item.id}`,
        source: "remoteok",
        company: item.company ?? "Unknown",
        role: item.position!,
        location: item.location ?? "Remote",
        url: item.url!,
        postedAt: item.date,
        description: item.description,
      }));
  },
};
