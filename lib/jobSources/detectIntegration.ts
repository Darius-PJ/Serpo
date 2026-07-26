export interface BoardIntegration {
  type: "greenhouse" | "lever";
  token: string;
}

/**
 * Recognizes the two ATS platforms this app knows how to query live
 * (Greenhouse and Lever both expose a public, unauthenticated per-company
 * JSON jobs API keyed by a "board token" that's also the URL path segment on
 * their public-facing career-page domains). Anything else returns null —
 * "browse-only", not a silent guess at an integration that doesn't exist.
 */
export function detectBoardIntegration(url: string): BoardIntegration | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "boards-api.greenhouse.io") {
    // Public board: boards.greenhouse.io/{token}[/...]; API: boards-api.greenhouse.io/v1/boards/{token}/...
    const token = host === "boards-api.greenhouse.io" ? segments[2] : segments[0];
    return token ? { type: "greenhouse", token } : null;
  }

  if (host === "jobs.lever.co" || host === "api.lever.co") {
    // Public board: jobs.lever.co/{token}[/...]; API: api.lever.co/v0/postings/{token}
    const token = host === "api.lever.co" ? segments[2] : segments[0];
    return token ? { type: "lever", token } : null;
  }

  return null;
}
