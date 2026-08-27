import { theHarvesterConnector } from "./theHarvester";
import type { DecisionMakerResult, OsintConnector } from "./types";

// Add another OSINT tool by implementing OsintConnector and registering it here.
const CONNECTORS: OsintConnector[] = [theHarvesterConnector];

export interface OsintRunResult {
  tool: string;
  label: string;
  results: DecisionMakerResult[];
  error?: string;
}

export async function researchAllTools(domain: string): Promise<OsintRunResult[]> {
  const configured = configuredOsintConnectors();

  return Promise.all(
    configured.map(async (connector): Promise<OsintRunResult> => {
      try {
        const results = await connector.research(domain);
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
export type { DecisionMakerResult, OsintConnector } from "./types";
