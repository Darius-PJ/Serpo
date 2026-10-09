// Plain-language industries offered on the Companies page. `searchTerms` are the
// job-title words that point at an industry, so a past search like "night nurse"
// or "line cook" can suggest companies without the user picking anything. Terms
// match whole words, case-insensitively; generic words ("manager", "analyst")
// are deliberately absent because they point nowhere in particular.
export const INDUSTRIES = [
  {
    id: "healthcare",
    label: "Healthcare",
    searchTerms: ["nurse", "nursing", "rn", "lpn", "cna", "medical", "clinical", "clinic", "health", "healthcare", "hospital", "patient", "pharmacy", "pharmacist", "physician", "doctor", "therapist", "dental", "caregiver"],
  },
  {
    id: "fitness",
    label: "Fitness & wellness",
    searchTerms: ["fitness", "personal trainer", "trainer", "gym", "wellness", "yoga", "pilates", "spa"],
  },
  {
    id: "finance",
    label: "Finance & insurance",
    searchTerms: ["finance", "financial", "accountant", "accounting", "bookkeeper", "bank", "banking", "teller", "underwriter", "insurance", "claims", "payroll", "tax", "auditor", "investment", "loan"],
  },
  {
    id: "retail",
    label: "Retail & shopping",
    searchTerms: ["retail", "sales associate", "cashier", "merchandiser", "store", "stocker", "ecommerce", "e-commerce", "buyer", "fashion"],
  },
  {
    id: "hospitality",
    label: "Food, travel & hotels",
    searchTerms: ["cook", "chef", "kitchen", "server", "barista", "bartender", "restaurant", "food", "hotel", "housekeeping", "hospitality", "catering", "travel", "front desk"],
  },
  {
    id: "transportation",
    label: "Transportation & delivery",
    searchTerms: ["driver", "delivery", "warehouse", "logistics", "supply chain", "shipping", "truck", "forklift", "dispatcher", "fleet", "courier"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing & aerospace",
    searchTerms: ["manufacturing", "production", "assembler", "assembly", "machinist", "mechanic", "welder", "technician", "aerospace", "mechanical", "electrical", "quality control"],
  },
  {
    id: "education",
    label: "Education",
    searchTerms: ["teacher", "teaching", "tutor", "education", "instructional", "curriculum", "school", "professor", "academic"],
  },
  {
    id: "media",
    label: "Media & entertainment",
    searchTerms: ["writer", "editor", "journalist", "reporter", "content", "video", "producer", "game", "games", "animator", "music", "podcast"],
  },
  {
    id: "nonprofit",
    label: "Nonprofits & public service",
    searchTerms: ["nonprofit", "non-profit", "fundraising", "grant", "advocacy", "policy", "community", "social worker", "case manager", "civic"],
  },
  {
    id: "business",
    label: "Business services",
    searchTerms: ["security officer", "security guard", "guard", "real estate", "property", "recruiter", "human resources", "hr", "receptionist", "administrative", "office"],
  },
  {
    id: "technology",
    label: "Technology & software",
    searchTerms: ["software", "developer", "programmer", "engineer", "engineering", "data", "it", "devops", "frontend", "backend", "cloud", "cybersecurity", "product manager", "ux"],
  },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]["id"];

export const INDUSTRY_LABELS = Object.fromEntries(INDUSTRIES.map((industry) => [industry.id, industry.label])) as Record<IndustryId, string>;

export function isIndustryId(value: unknown): value is IndustryId {
  return typeof value === "string" && Object.hasOwn(INDUSTRY_LABELS, value);
}

// "\b" fails around "-" and "+" in terms like "e-commerce", so word edges are
// spelled out: start/end of text or any character that isn't a letter or digit.
const TERM_PATTERNS = INDUSTRIES.map((industry) => ({
  id: industry.id,
  patterns: industry.searchTerms.map((term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i")),
}));

/** The industries a search phrase points at, e.g. "ER night nurse" -> ["healthcare"]. */
export function industriesForSearch(phrase: string): IndustryId[] {
  return TERM_PATTERNS.filter(({ patterns }) => patterns.some((pattern) => pattern.test(phrase))).map(({ id }) => id);
}
