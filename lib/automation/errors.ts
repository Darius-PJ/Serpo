import "server-only";
import { APIConnectionError } from "@anthropic-ai/sdk";

/** A failure that another attempt cannot fix. The runner marks the job dead at once. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

// Node and undici codes for a connection that failed or timed out.
const TRANSIENT_NETWORK_CODES: Record<string, true> = {
  ECONNRESET: true,
  ECONNREFUSED: true,
  ETIMEDOUT: true,
  ENOTFOUND: true,
  EAI_AGAIN: true,
  UND_ERR_CONNECT_TIMEOUT: true,
  UND_ERR_SOCKET: true,
};

/**
 * Whether a failure is worth another attempt later: the network was
 * unreachable, or the server answered 408, 429, or 5xx. Anything else (a 4xx,
 * a parse error, a bug) fails the same way next time.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof APIConnectionError) return true;
  if (!(err instanceof Error)) return false;
  if ("status" in err && typeof err.status === "number") return err.status === 408 || err.status === 429 || err.status >= 500;
  if (err.name === "TimeoutError") return true;
  const code = errorCode(err) ?? errorCode(err.cause);
  return code !== undefined && TRANSIENT_NETWORK_CODES[code] === true;
}

function errorCode(value: unknown): string | undefined {
  return value && typeof value === "object" && "code" in value && typeof value.code === "string" ? value.code : undefined;
}
