import { hunterConnector } from "./hunter";
import type { DecisionMakerResult, OsintConnector, OsintQuery } from "./types";

// Add another OSINT tool by implementing OsintConnector and registering it here.
const CONNECTORS: OsintConnector[] = [hunterConnector];

export interface OsintRunResult {
  tool: string;
  label: string;
  results: DecisionMakerResult[];
  error?: string;
}

export async function researchAllTools(query: OsintQuery): Promise<OsintRunResult[]> {
  const configured = configuredOsintConnectors();

  return Promise.all(
    configured.map(async (connector): Promise<OsintRunResult> => {
      try {
        const results = await connector.research(query);
        return { tool: connector.key, label: connector.label, results };
      } catch (err) {
        return {
          tool: connector.key,
          label: connector.label,
          results: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );
}

export function configuredOsintConnectors() {
  return CONNECTORS.filter((connector) => connector.isConfigured());
}

export { CONNECTORS as osintConnectors };
export type { DecisionMakerResult, OsintConnector, OsintQuery } from "./types";
