import type { ProviderConfig } from "../config/index.js";
import { MockChatProvider } from "./mock-provider.js";
import { RealProviderStub } from "./real-provider-stub.js";
import type { ChatProvider } from "./types.js";

export function createProvider(config: ProviderConfig): ChatProvider {
  if (config.kind === "real_stub") {
    return new RealProviderStub({
      providerId: config.id,
      providerName: config.upstreamName,
      baseUrl: config.baseUrl
    });
  }

  return new MockChatProvider({
    providerId: config.id,
    behavior: config.behavior,
    delayMs: config.delayMs
  });
}
