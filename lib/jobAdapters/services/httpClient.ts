// fetch wrapper with retry/backoff/jitter, layered on top of the per-call timeout
// already proven in production (lib/jobSources/timeoutConfig.ts). Retries only
// network-level failures and 429/5xx responses — a 4xx like 400/404 is returned as-is
// so the caller's own `if (!res.ok) throw` handles it exactly like today's connectors.
import { getSourceFetchTimeoutMs } from "@/lib/jobSources/timeoutConfig";
import type { Logger } from "../types";

export interface FetchWithRetryOptions extends RequestInit {
  maxRetries?: number;
  timeoutMs?: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions,
  ctx: { signal: AbortSignal; logger: Logger }
): Promise<Response> {
  const { maxRetries = 2, timeoutMs = getSourceFetchTimeoutMs(), ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptSignal = AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)]);
    try {
      const res = await fetch(url, { ...init, signal: attemptSignal });
      if (isRetryableStatus(res.status) && attempt < maxRetries) {
        ctx.logger.warn("retryable HTTP status, backing off", { url, status: res.status, attempt });
        lastError = new Error(`retryable HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (ctx.signal.aborted || attempt >= maxRetries) throw err;
      ctx.logger.warn("fetch failed, backing off", { url, attempt, error: err instanceof Error ? err.message : String(err) });
    }

    const backoffMs = 2 ** attempt * 200; // 200, 400, 800, ...
    const jitterMs = Math.random() * backoffMs * 0.3;
    await sleep(backoffMs + jitterMs, ctx.signal);
  }

  throw lastError;
}
