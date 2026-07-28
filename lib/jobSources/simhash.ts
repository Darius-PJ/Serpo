// SimHash-based near-duplicate detection for job description text — runs
// entirely locally (no embeddings API, no cost, no new API key), matching
// this app's lean-dependency, cost-conscious design. See lib/jobSources/dedupe.ts
// for how this is used to cluster cross-posted duplicates into "job families."
//
// Uses BigInt(...) calls rather than `123n` literal syntax throughout: this
// project's tsconfig target is ES2017 (a shared config, not worth changing
// for one file), and BigInt literals require ES2020+.

const FNV_OFFSET_BASIS = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK_64 = BigInt("0xffffffffffffffff");
const ZERO = BigInt(0);
const ONE = BigInt(1);

function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function tokenize(text: string): string[] {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const SHINGLE_SIZE = 2;

function shingle(tokens: string[]): string[] {
  if (tokens.length < SHINGLE_SIZE) return tokens;
  const shingles: string[] = [];
  for (let i = 0; i <= tokens.length - SHINGLE_SIZE; i++) {
    shingles.push(tokens.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return shingles;
}

/**
 * Computes a 64-bit SimHash fingerprint (as a 16-char hex string) for the
 * given text. Near-duplicate text (same posting, reworded boilerplate,
 * different whitespace) produces fingerprints with a small Hamming distance;
 * unrelated text produces fingerprints that differ in roughly half their
 * bits. Repeated shingles naturally get more weight than singletons, since
 * every occurrence — not just unique shingles — contributes to the bit
 * vote below.
 */
export function computeSimhash(text: string): string {
  const shingles = shingle(tokenize(text));
  if (shingles.length === 0) return "0".repeat(16);

  const bitVotes = new Array<number>(64).fill(0);
  for (const s of shingles) {
    const hash = fnv1a64(s);
    for (let bit = 0; bit < 64; bit++) {
      const isSet = (hash >> BigInt(bit)) & ONE;
      bitVotes[bit] += isSet === ONE ? 1 : -1;
    }
  }

  let fingerprint = ZERO;
  for (let bit = 0; bit < 64; bit++) {
    if (bitVotes[bit] > 0) {
      fingerprint |= ONE << BigInt(bit);
    }
  }
  return fingerprint.toString(16).padStart(16, "0");
}

/** 0–1 similarity between two SimHash fingerprints: 1 - (Hamming distance / 64). */
export function hammingSimilarity(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  while (diff > ZERO) {
    distance += Number(diff & ONE);
    diff >>= ONE;
  }
  return 1 - distance / 64;
}
