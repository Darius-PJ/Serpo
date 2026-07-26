import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Server-only singleton — the Anthropic key must never reach a client bundle.
export const claude = new Anthropic();

export const CLAUDE_MODEL = "claude-opus-4-8";
