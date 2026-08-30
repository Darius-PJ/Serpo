// Shared between server code and client form components — keep import-safe
// for both (no server-only), like lib/pipeline/types.ts.
export const INTERACTION_KINDS = ["email", "call", "linkedin", "meeting", "note"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const INTERACTION_DIRECTIONS = ["outbound", "inbound"] as const;
export type InteractionDirection = (typeof INTERACTION_DIRECTIONS)[number];

export function isInteractionKind(value: unknown): value is InteractionKind {
  return typeof value === "string" && (INTERACTION_KINDS as readonly string[]).includes(value);
}

export function isInteractionDirection(value: unknown): value is InteractionDirection {
  return typeof value === "string" && (INTERACTION_DIRECTIONS as readonly string[]).includes(value);
}
