// Companies the Companies page can suggest. On 2026-10-08 every entry passed
// Serpo's own pool verification with open postings, and its board page opened in
// a browser. Left out: boards that 404'd, were empty or listed fewer than five
// openings; Anduril, whose 43 MB board nears the fetch timeout; and Veeva and
// Colliers, whose public board pages are broken although their APIs answer.
// Suggesting a company changes nothing: following one creates a private board and
// verifies it live through the same pool check as a board added by hand, so a
// board that has since moved fails visibly instead of silently returning nothing.
import type { IndustryId } from "./industries";

export type CompanyPlatform = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export interface CatalogCompany {
  name: string;
  platform: CompanyPlatform;
  /** The platform's board identifier, as it appears in the board URL. */
  token: string;
  industries: readonly IndustryId[];
}

export const PLATFORM_LABELS: Record<CompanyPlatform, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
};

/** The public board page a person can open, and the URL each platform adapter's detectTarget() recognizes. */
export function companyBoardUrl(platform: CompanyPlatform, token: string): string {
  switch (platform) {
    case "greenhouse":
      return `https://job-boards.greenhouse.io/${token}`;
    case "lever":
      return `https://jobs.lever.co/${token}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${token}`;
    case "smartrecruiters":
      return `https://careers.smartrecruiters.com/${token}`;
  }
}

/** Identity of one company board across the catalog, follows and hidden suggestions. Tokens are case-insensitive. */
export function companyKey(platform: string, token: string): string {
  return `${platform}:${token.toLowerCase()}`;
}

export const COMPANY_CATALOG: readonly CatalogCompany[] = [
  // Healthcare
  { name: "One Medical", platform: "greenhouse", token: "onemedical", industries: ["healthcare"] },
  { name: "Oscar Health", platform: "greenhouse", token: "oscar", industries: ["healthcare", "finance"] },
  { name: "Zocdoc", platform: "greenhouse", token: "zocdoc", industries: ["healthcare"] },
  { name: "Flatiron Health", platform: "greenhouse", token: "flatironhealth", industries: ["healthcare"] },
  { name: "Komodo Health", platform: "greenhouse", token: "komodohealth", industries: ["healthcare"] },
  { name: "Omada Health", platform: "greenhouse", token: "omadahealth", industries: ["healthcare"] },
  { name: "Ro", platform: "lever", token: "ro", industries: ["healthcare"] },

  // Fitness & wellness
  { name: "Equinox", platform: "smartrecruiters", token: "Equinox", industries: ["fitness"] },
  { name: "Peloton", platform: "greenhouse", token: "peloton", industries: ["fitness"] },
  { name: "ClassPass", platform: "greenhouse", token: "classpass", industries: ["fitness"] },
  { name: "Oura", platform: "greenhouse", token: "oura", industries: ["fitness", "healthcare"] },

  // Finance & insurance
  { name: "Experian", platform: "smartrecruiters", token: "Experian", industries: ["finance", "business"] },
  { name: "Stripe", platform: "greenhouse", token: "stripe", industries: ["finance", "technology"] },
  { name: "Robinhood", platform: "greenhouse", token: "robinhood", industries: ["finance"] },
  { name: "Coinbase", platform: "greenhouse", token: "coinbase", industries: ["finance"] },
  { name: "Chime", platform: "greenhouse", token: "chime", industries: ["finance"] },
  { name: "Affirm", platform: "greenhouse", token: "affirm", industries: ["finance"] },
  { name: "Brex", platform: "greenhouse", token: "brex", industries: ["finance"] },
  { name: "SoFi", platform: "greenhouse", token: "sofi", industries: ["finance"] },
  { name: "Carta", platform: "greenhouse", token: "carta", industries: ["finance"] },
  { name: "Mercury", platform: "greenhouse", token: "mercury", industries: ["finance"] },
  { name: "Betterment", platform: "greenhouse", token: "betterment", industries: ["finance"] },
  { name: "Ramp", platform: "ashby", token: "ramp", industries: ["finance"] },
  { name: "Plaid", platform: "ashby", token: "plaid", industries: ["finance", "technology"] },

  // Retail & shopping
  { name: "Carvana", platform: "greenhouse", token: "carvana", industries: ["retail", "transportation"] },
  { name: "Instacart", platform: "greenhouse", token: "instacart", industries: ["retail", "transportation"] },
  { name: "Glossier", platform: "greenhouse", token: "glossier", industries: ["retail"] },
  { name: "Everlane", platform: "greenhouse", token: "everlane", industries: ["retail"] },
  { name: "Mejuri", platform: "greenhouse", token: "mejuri", industries: ["retail"] },
  { name: "Rent the Runway", platform: "greenhouse", token: "renttherunway", industries: ["retail"] },
  { name: "The Farmer's Dog", platform: "greenhouse", token: "thefarmersdog", industries: ["retail"] },

  // Food, travel & hotels
  { name: "Domino's", platform: "smartrecruiters", token: "Dominos", industries: ["hospitality", "transportation"] },
  { name: "Sodexo", platform: "smartrecruiters", token: "Sodexo", industries: ["hospitality", "business"] },
  { name: "Accor", platform: "smartrecruiters", token: "Accor", industries: ["hospitality"] },
  { name: "HelloFresh", platform: "greenhouse", token: "hellofresh", industries: ["hospitality", "transportation"] },
  { name: "Sweetgreen", platform: "greenhouse", token: "sweetgreen", industries: ["hospitality"] },
  { name: "DoorDash", platform: "greenhouse", token: "doordashusa", industries: ["hospitality", "transportation"] },
  { name: "Airbnb", platform: "greenhouse", token: "airbnb", industries: ["hospitality", "technology"] },
  { name: "Tripadvisor", platform: "greenhouse", token: "tripadvisor", industries: ["hospitality"] },
  { name: "Toast", platform: "greenhouse", token: "toast", industries: ["hospitality", "technology"] },

  // Transportation & delivery
  { name: "Lyft", platform: "greenhouse", token: "lyft", industries: ["transportation"] },
  { name: "Flexport", platform: "greenhouse", token: "flexport", industries: ["transportation"] },
  { name: "Samsara", platform: "greenhouse", token: "samsara", industries: ["transportation", "technology"] },
  { name: "Waymo", platform: "greenhouse", token: "waymo", industries: ["transportation"] },
  { name: "Zoox", platform: "lever", token: "zoox", industries: ["transportation", "manufacturing"] },
  { name: "Zipline", platform: "greenhouse", token: "flyzipline", industries: ["transportation", "manufacturing"] },

  // Manufacturing & aerospace
  { name: "Bosch", platform: "smartrecruiters", token: "BoschGroup", industries: ["manufacturing"] },
  { name: "Continental", platform: "smartrecruiters", token: "Continental", industries: ["manufacturing", "transportation"] },
  { name: "Avery Dennison", platform: "smartrecruiters", token: "AveryDennison", industries: ["manufacturing"] },
  { name: "SpaceX", platform: "greenhouse", token: "spacex", industries: ["manufacturing"] },
  { name: "Relativity Space", platform: "greenhouse", token: "relativity", industries: ["manufacturing"] },
  { name: "Formlabs", platform: "greenhouse", token: "formlabs", industries: ["manufacturing"] },
  { name: "Shield AI", platform: "lever", token: "shieldai", industries: ["manufacturing"] },

  // Education
  { name: "Coursera", platform: "greenhouse", token: "coursera", industries: ["education"] },
  { name: "Khan Academy", platform: "greenhouse", token: "khanacademy", industries: ["education", "nonprofit"] },
  { name: "Duolingo", platform: "greenhouse", token: "duolingo", industries: ["education", "technology"] },
  { name: "MasterClass", platform: "greenhouse", token: "masterclass", industries: ["education", "media"] },
  { name: "Guild", platform: "greenhouse", token: "guild", industries: ["education"] },
  { name: "Newsela", platform: "greenhouse", token: "newsela", industries: ["education"] },

  // Media & entertainment
  { name: "Ubisoft", platform: "smartrecruiters", token: "Ubisoft2", industries: ["media"] },
  { name: "Spotify", platform: "lever", token: "spotify", industries: ["media", "technology"] },
  { name: "Vox Media", platform: "greenhouse", token: "voxmedia", industries: ["media"] },
  { name: "Axios", platform: "greenhouse", token: "axios", industries: ["media"] },
  { name: "SeatGeek", platform: "greenhouse", token: "seatgeek", industries: ["media"] },
  { name: "Pinterest", platform: "greenhouse", token: "pinterest", industries: ["media", "technology"] },
  { name: "Reddit", platform: "greenhouse", token: "reddit", industries: ["media", "technology"] },
  { name: "Discord", platform: "greenhouse", token: "discord", industries: ["media", "technology"] },
  { name: "ElevenLabs", platform: "ashby", token: "elevenlabs", industries: ["media", "technology"] },

  // Nonprofits & public service
  { name: "ProPublica", platform: "greenhouse", token: "propublica", industries: ["nonprofit", "media"] },
  { name: "Wikimedia Foundation", platform: "greenhouse", token: "wikimedia", industries: ["nonprofit"] },
  { name: "Code for America", platform: "greenhouse", token: "codeforamerica", industries: ["nonprofit"] },
  { name: "Nava PBC", platform: "greenhouse", token: "navapbc", industries: ["nonprofit", "technology"] },
  { name: "GiveDirectly", platform: "greenhouse", token: "givedirectly", industries: ["nonprofit"] },
  { name: "ACLU", platform: "greenhouse", token: "aclu", industries: ["nonprofit"] },

  // Business services
  { name: "Securitas", platform: "smartrecruiters", token: "Securitas", industries: ["business"] },
  { name: "Gusto", platform: "greenhouse", token: "gusto", industries: ["business", "finance"] },
  { name: "Justworks", platform: "greenhouse", token: "justworks", industries: ["business"] },

  // Technology & software
  { name: "OpenAI", platform: "ashby", token: "openai", industries: ["technology"] },
  { name: "Palantir", platform: "lever", token: "palantir", industries: ["technology"] },
  { name: "Cloudflare", platform: "greenhouse", token: "cloudflare", industries: ["technology"] },
  { name: "Datadog", platform: "greenhouse", token: "datadog", industries: ["technology"] },
  { name: "Figma", platform: "greenhouse", token: "figma", industries: ["technology"] },
  { name: "GitLab", platform: "greenhouse", token: "gitlab", industries: ["technology"] },
  { name: "Twilio", platform: "greenhouse", token: "twilio", industries: ["technology"] },
  { name: "Dropbox", platform: "greenhouse", token: "dropbox", industries: ["technology"] },
  { name: "Asana", platform: "greenhouse", token: "asana", industries: ["technology"] },
  { name: "Squarespace", platform: "greenhouse", token: "squarespace", industries: ["technology"] },
  { name: "MongoDB", platform: "greenhouse", token: "mongodb", industries: ["technology"] },
  { name: "Elastic", platform: "greenhouse", token: "elastic", industries: ["technology"] },
  { name: "Okta", platform: "greenhouse", token: "okta", industries: ["technology"] },
  { name: "Notion", platform: "ashby", token: "notion", industries: ["technology"] },
  { name: "Linear", platform: "ashby", token: "linear", industries: ["technology"] },
  { name: "Zapier", platform: "ashby", token: "zapier", industries: ["technology"] },
  { name: "Vanta", platform: "ashby", token: "vanta", industries: ["technology"] },
  { name: "Replit", platform: "ashby", token: "replit", industries: ["technology"] },
  { name: "Supabase", platform: "ashby", token: "supabase", industries: ["technology"] },
  { name: "ClickHouse", platform: "ashby", token: "clickhouse", industries: ["technology"] },
  { name: "Outreach", platform: "lever", token: "outreach", industries: ["technology"] },
];
