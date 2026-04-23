import type { ChatCompletionRequest, ProviderChatCompletion } from "../chat/types.js";
import { ProviderError } from "./errors.js";
import type { ChatProvider, ProviderContext } from "./types.js";

export interface RealProviderStubConfig {
  readonly providerId: string;
  readonly providerName: string;
  readonly baseUrl: string;
}

export class RealProviderStub implements ChatProvider {
  public readonly name: string;
  private readonly upstreamName: string;
  private readonly baseUrl: string;

  public constructor(config: RealProviderStubConfig) {
    this.name = config.providerId;
    this.upstreamName = config.providerName;
    this.baseUrl = config.baseUrl;
  }

  public async createChatCompletion(
    request: ChatCompletionRequest,
    context: ProviderContext
  ): Promise<ProviderChatCompletion> {
    // Milestone 2 still keeps the real adapter at the provider boundary only.
    context.logger.warn("real_provider_stub_invoked", {
      configuredBaseUrl: this.baseUrl,
      model: request.model,
      provider: this.name
    });

    throw new ProviderError(
      501,
      "provider_not_implemented",
      `Configured provider adapter "${this.upstreamName}" is a Milestone 2 stub and does not call external APIs yet.`,
      false
    );
  }
}
