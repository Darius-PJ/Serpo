import "server-only";

export interface PoolVerificationResult {
  poolStatus: "live" | "browse-only" | "failed";
  integrationType: string | null;
  integrationToken: string | null;
}

// Structural subset of lib/jobAdapters Adapter — everything this decision needs.
export interface PoolCandidateAdapter {
  metadata: { id: string };
  detectTarget?(url: string): string | null;
}

export interface PoolVerificationDeps<A extends PoolCandidateAdapter> {
  searchTarget(adapter: A, token: string): Promise<{ errors: { message: string }[] }>;
  fetchUrl(url: string): Promise<{ ok: boolean }>;
}

/**
 * Decides what joining the search pool means for a board, honestly: a board a
 * recognized ATS adapter claims gets verified with a real query and becomes
 * "live"; everything else gets only a reachability check and at best
 * "browse-only" — never a false checkmark implying live search.
 */
export async function verifyBoardForPool<A extends PoolCandidateAdapter>(
  boardUrl: string,
  adapters: A[],
  deps: PoolVerificationDeps<A>,
): Promise<PoolVerificationResult> {
  let matched: { adapter: A; token: string } | null = null;
  for (const adapter of adapters) {
    const token = adapter.detectTarget?.(boardUrl);
    if (token) {
      matched = { adapter, token };
      break;
    }
  }

  if (matched) {
    try {
      const envelope = await deps.searchTarget(matched.adapter, matched.token);
      if (envelope.errors.length > 0) throw new Error(envelope.errors[0].message);
      return { poolStatus: "live", integrationType: matched.adapter.metadata.id, integrationToken: matched.token };
    } catch {
      return { poolStatus: "failed", integrationType: null, integrationToken: null };
    }
  }

  try {
    const res = await deps.fetchUrl(boardUrl);
    return { poolStatus: res.ok ? "browse-only" : "failed", integrationType: null, integrationToken: null };
  } catch {
    return { poolStatus: "failed", integrationType: null, integrationToken: null };
  }
}
