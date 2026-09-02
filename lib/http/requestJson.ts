export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Fetches a JSON API and turns every non-2xx response into a user-safe error. */
export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: Fetcher = fetch
): Promise<T> {
  const response = await fetcher(input, init);
  const payload = await response.json().catch(() => null) as { error?: unknown } | T | null;

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed (${response.status})`;
    throw new ApiRequestError(message, response.status);
  }

  return payload as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
