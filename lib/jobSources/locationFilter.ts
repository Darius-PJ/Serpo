import type { NormalizedJobListing } from "./types";

// Sources that are remote-only by definition (every listing they return is remote).
const REMOTE_ONLY_SOURCES = new Set(["remoteok", "remotive", "himalayas", "jobicy"]);

// Sources already structurally constrained to the US, independent of what their
// location string looks like (Adzuna is queried with country=us; USAJobs is the
// US federal government).
const ALWAYS_US_SOURCES = new Set(["adzuna", "usajobs"]);

const REMOTE_KEYWORDS = /\b(remote|worldwide|anywhere|work from home|wfh)\b/i;

const US_STATE_NAMES =
  "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia";

const US_STATE_ABBR =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const US_HINT_RE = new RegExp(
  `\\b(usa|u\\.s\\.a\\.?|u\\.s\\.|united states|${US_STATE_NAMES})\\b|,\\s*(${US_STATE_ABBR})\\b`,
  "i"
);

/**
 * Best-effort, not a geocoding service: catches the common cases (explicit
 * "USA"/state names, ", NY"-style abbreviation suffixes, "Remote"/"Worldwide")
 * but can miss legitimately-US listings with sparse location strings (e.g. a
 * bare county name with no state). Sources already structurally guaranteed to
 * be US (Adzuna/USAJobs) or remote-only (RemoteOK/Remotive/Himalayas/Jobicy)
 * skip the string heuristic entirely rather than risk a false negative there.
 */
export function isUsOrRemoteListing(listing: NormalizedJobListing): boolean {
  if (ALWAYS_US_SOURCES.has(listing.source) || REMOTE_ONLY_SOURCES.has(listing.source)) {
    return true;
  }
  const location = listing.location ?? "";
  return REMOTE_KEYWORDS.test(location) || US_HINT_RE.test(location);
}

/** Stricter than isUsOrRemoteListing — used only when the user checks "Remote only". */
export function isRemoteListing(listing: NormalizedJobListing): boolean {
  if (REMOTE_ONLY_SOURCES.has(listing.source)) return true;
  return REMOTE_KEYWORDS.test(listing.location ?? "");
}
