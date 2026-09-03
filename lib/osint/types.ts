export interface DecisionMakerResult {
  name?: string;
  title?: string;
  email?: string;
  sourceTool: string;
  /** Raw signal from the tool (e.g. which module found it) — never a fabricated score. */
  confidence?: string;
}

/** What to research: a user-confirmed domain, or the company name exactly as
 * the user entered it — never a guessed domain. */
export interface OsintQuery {
  domain?: string;
  company?: string;
}

export interface OsintConnector {
  key: string;
  label: string;
  isConfigured(): boolean;
  /** Research a company and return whatever contact signals the tool finds. */
  research(query: OsintQuery): Promise<DecisionMakerResult[]>;
}
