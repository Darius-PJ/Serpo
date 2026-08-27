import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

const MAX_EXTERNAL_URL_LENGTH = 2_000;
const MAX_REDIRECTS = 5;

export class UnsafeExternalUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeExternalUrlError";
  }
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/^\[|\]$/g, "");
}

/** Returns true for private, local, link-local, documentation, multicast, and otherwise non-public IP space. */
export function isNonPublicIpAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  const family = net.isIP(normalized);
  if (family === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (family === 6) {
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mappedIpv4) return isNonPublicIpAddress(mappedIpv4);
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
  }
  return true;
}

/** Syntax-only validation for URLs stored in the database. Server-side callers must also resolve the hostname with assertSafeExternalUrl. */
export function parseExternalHttpsUrl(value: unknown): URL {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new UnsafeExternalUrlError("a valid HTTPS URL is required");
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new UnsafeExternalUrlError("a valid HTTPS URL is required");
  }

  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new UnsafeExternalUrlError("URL must be a credential-free HTTPS URL");
  }
  const hostname = normalizeAddress(url.hostname);
  if (hostname === "localhost" || (net.isIP(hostname) !== 0 && isNonPublicIpAddress(hostname))) {
    throw new UnsafeExternalUrlError("URL must resolve to a public internet host");
  }
  return url;
}

type Lookup = typeof dnsLookup;

/** Resolves every A/AAAA record before a server-side request to prevent access to private network addresses. */
export async function assertSafeExternalUrl(value: unknown, lookup: Lookup = dnsLookup): Promise<URL> {
  const url = parseExternalHttpsUrl(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isNonPublicIpAddress(address))) {
    throw new UnsafeExternalUrlError("URL must resolve only to public internet addresses");
  }
  return url;
}

/**
 * Fetches a public HTTPS URL without trusting redirects. Each hop is resolved and
 * checked separately so a public URL cannot redirect the server into a private network.
 */
export async function fetchSafeExternalUrl(value: unknown, init: RequestInit = {}): Promise<Response> {
  let url = await assertSafeExternalUrl(value);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount === MAX_REDIRECTS) {
      throw new UnsafeExternalUrlError("too many redirects while validating URL");
    }
    url = await assertSafeExternalUrl(new URL(location, url).toString());
  }
  throw new UnsafeExternalUrlError("too many redirects while validating URL");
}
