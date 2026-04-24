import type { ChatCompletionRequest } from "../chat/types.js";
import type { UsageGovernanceConfig } from "../config/index.js";
import type { GovernanceUsageEstimate } from "./types.js";

export function estimateChatUsage(
  request: ChatCompletionRequest,
  config: UsageGovernanceConfig
): GovernanceUsageEstimate {
  const totalCharacters =
    request.model.length + request.messages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedTokens = Math.max(1, Math.ceil(totalCharacters / config.tokenEstimateCharsPerToken));
  const estimatedCostMinorUnits = Math.max(
    1,
    Math.ceil((estimatedTokens * config.tokenCostPer1KMinorUnits) / 1_000)
  );

  return {
    estimatedTokens,
    estimatedCostMinorUnits,
    totalCharacters
  };
}
