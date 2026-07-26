export interface CuratedBoard {
  name: string;
  url: string;
  jurisdiction: "state" | "municipal";
  region: string;
}

// Small, deliberately verified seed (each URL confirmed live before shipping) —
// the long tail of state/municipal boards is what the "Find more boards"
// AI-discovery action is for. USAJobs is already a search connector, not
// duplicated here.
export const CURATED_BOARDS: CuratedBoard[] = [
  { name: "CalCareers", url: "https://www.calcareers.ca.gov", jurisdiction: "state", region: "CA" },
  { name: "StateJobsNY", url: "https://statejobs.ny.gov", jurisdiction: "state", region: "NY" },
  { name: "Work in Texas", url: "https://www.workintexas.com", jurisdiction: "state", region: "TX" },
  { name: "People First (Florida)", url: "https://jobs.myflorida.com", jurisdiction: "state", region: "FL" },
  {
    name: "GovernmentJobs.com (NEOGOV)",
    url: "https://www.governmentjobs.com",
    jurisdiction: "municipal",
    region: "Multi-state city/county aggregator",
  },
];
