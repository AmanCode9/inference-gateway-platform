import { createHash } from "node:crypto";
import type { ChatCompletionRequest } from "../chat/types.js";

export const EXACT_CHAT_CACHE_SCHEMA_VERSION = "exact-chat-v1";

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface ExactChatCacheKeyInput {
  readonly apiKey: string;
  readonly request: ChatCompletionRequest;
}

export function createExactChatCacheKey(input: ExactChatCacheKeyInput): string {
  const tenantHash = hashValue(input.apiKey);
  const payloadHash = hashValue(canonicalStringify(createExactChatCachePayload(input.request)));

  return `chat_completion:${EXACT_CHAT_CACHE_SCHEMA_VERSION}:tenant:${tenantHash}:payload:${payloadHash}`;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function createExactChatCachePayload(request: ChatCompletionRequest): CanonicalJsonValue {
  return {
    model: request.model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  };
}

function canonicalize(value: unknown): CanonicalJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry) ?? null);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, canonicalize(entryValue)] as const)
      .filter((entry): entry is readonly [string, CanonicalJsonValue] => entry[1] !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return Object.fromEntries(entries) as { readonly [key: string]: CanonicalJsonValue };
  }

  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
