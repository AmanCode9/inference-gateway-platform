import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatMessage } from "../chat/types.js";

export interface SemanticCacheEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly systemPromptHash?: string;
}

const RISK_INDICATORS = [
  "latest",
  "today",
  "current",
  "now",
  "recent",
  "news",
  "price",
  "stock",
  "weather",
  "score",
  "schedule",
  "deadline",
  "my",
  "me",
  "password",
  "secret",
  "api key",
  "token",
  "credential",
  "private",
  "confidential",
  "attached",
  "screenshot",
  "image",
  "file",
  "above",
  "previous",
  "this document",
  "legal advice",
  "medical advice",
  "financial advice"
] as const;

export function evaluateSemanticCacheEligibility(request: ChatCompletionRequest): SemanticCacheEligibility {
  if (!isSafeSingleTurnShape(request.messages)) {
    return {
      eligible: false,
      reason: "unsupported_request_shape"
    };
  }

  const riskyIndicator = findRiskIndicator(request.messages);

  if (riskyIndicator) {
    return {
      eligible: false,
      reason: `risk_indicator:${riskyIndicator}`
    };
  }

  const systemPrompt = request.messages.find((message) => message.role === "system");

  if (!systemPrompt) {
    return {
      eligible: true
    };
  }

  return {
    eligible: true,
    systemPromptHash: hashSemanticValue(systemPrompt.content)
  };
}

export function createSemanticInputHash(input: string): string {
  return hashSemanticValue(input);
}

function isSafeSingleTurnShape(messages: readonly ChatMessage[]): boolean {
  if (messages.length === 1) {
    return messages[0]?.role === "user";
  }

  if (messages.length === 2) {
    return messages[0]?.role === "system" && messages[1]?.role === "user";
  }

  return false;
}

function findRiskIndicator(messages: readonly ChatMessage[]): string | undefined {
  const content = messages.map((message) => message.content).join("\n").toLowerCase();

  return RISK_INDICATORS.find((indicator) => {
    const escapedIndicator = indicator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escapedIndicator}\\b`, "i").test(content);
  });
}

function hashSemanticValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
