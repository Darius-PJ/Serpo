import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export class AiAssistanceDisabledError extends Error {
  constructor() {
    super("AI assistance is disabled. Set ENABLE_AI_ASSISTANCE=true only after reviewing the privacy notice.");
    this.name = "AiAssistanceDisabledError";
  }
}

function assertAiAssistanceEnabled() {
  if (process.env.ENABLE_AI_ASSISTANCE !== "true") throw new AiAssistanceDisabledError();
}

const client = new Anthropic();
// Default-deny AI egress at the provider boundary for every messages.create caller.
export const claude = new Proxy(client, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (property !== "messages") return value;
    return new Proxy(value as object, {
      get(messages, messagesProperty, messagesReceiver) {
        const method = Reflect.get(messages, messagesProperty, messagesReceiver);
        if (messagesProperty !== "create" || typeof method !== "function") return method;
        return (...args: unknown[]) => {
          assertAiAssistanceEnabled();
          return method.apply(messages, args);
        };
      },
    });
  },
});

export const CLAUDE_MODEL = "claude-opus-4-8";
