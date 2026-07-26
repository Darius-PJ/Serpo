// Each label: 1-63 chars, alphanumeric/hyphen, no leading/trailing hyphen. At least one dot (a real TLD).
const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

/** Rejects anything that isn't a plausible domain name — in particular anything starting with "-",
 *  which a CLI argument parser could otherwise misread as a flag. */
export function isValidDomain(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 && HOSTNAME_RE.test(value);
}
