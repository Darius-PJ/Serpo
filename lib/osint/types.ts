export interface DecisionMakerResult {
  name?: string;
  title?: string;
  email?: string;
  sourceTool: string;
  /** Raw signal from the tool (e.g. which module found it) — never a fabricated score. */
  confidence?: string;
}

export interface OsintConnector {
  key: string;
  label: string;
  isConfigured(): boolean;
  /** Research a company by domain and return whatever contact signals it finds. */
  research(domain: string): Promise<DecisionMakerResult[]>;
}
