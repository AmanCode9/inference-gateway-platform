import type { GatewayConfig } from "../config/index.js";
import { MockChatProvider } from "./mock-provider.js";
import { RealProviderStub } from "./real-provider-stub.js";
import type { ChatProvider } from "./types.js";

export function createProvider(config: GatewayConfig): ChatProvider {
  if (config.providerKind === "real_stub") {
    return new RealProviderStub({
      providerName: config.realProviderName,
      baseUrl: config.realProviderBaseUrl
    });
  }

  return new MockChatProvider();
}
