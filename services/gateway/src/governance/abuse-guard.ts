import type { AbuseProtectionConfig } from "../config/index.js";
import type { ChatCompletionRequest } from "../chat/types.js";
import { badRequest } from "../http/errors.js";

export function assertRequestWithinAbuseLimits(
  request: ChatCompletionRequest,
  config: AbuseProtectionConfig
): void {
  if (request.messages.length > config.maxMessageCount) {
    throw badRequest(`messages must contain at most ${config.maxMessageCount} items.`);
  }

  let totalCharacters = 0;

  for (const message of request.messages) {
    const messageCharacters = message.content.length;

    if (messageCharacters > config.maxMessageCharacters) {
      throw badRequest(
        `message.content must contain at most ${config.maxMessageCharacters} characters.`
      );
    }

    totalCharacters += messageCharacters;
  }

  if (totalCharacters > config.maxTotalMessageCharacters) {
    throw badRequest(
      `messages content must contain at most ${config.maxTotalMessageCharacters} characters in total.`
    );
  }
}
