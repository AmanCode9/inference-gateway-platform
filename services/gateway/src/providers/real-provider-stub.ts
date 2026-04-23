import type { ChatCompletionRequest, ProviderChatCompletion } from "../chat/types.js";
import { notImplemented } from "../http/errors.js";
import type { ChatProvider, ProviderContext } from "./types.js";

export interface RealProviderStubConfig {
  readonly providerName: string;
  readonly baseUrl: string;
}

export class RealProviderStub implements ChatProvider {
  public readonly name: string;
  private readonly baseUrl: string;

  public constructor(config: RealProviderStubConfig) {
    this.name = config.providerName;
    this.baseUrl = config.baseUrl;
  }

  public async createChatCompletion(
    request: ChatCompletionRequest,
    context: ProviderContext
  ): Promise<ProviderChatCompletion> {
    // Milestone 1 keeps the real adapter at the provider boundary only.
    context.logger.warn("real_provider_stub_invoked", {
      configuredBaseUrl: this.baseUrl,
      model: request.model
    });

    throw notImplemented(
      `Configured provider adapter "${this.name}" is a Milestone 1 stub and does not call external APIs yet.`,
      "provider_not_implemented"
    );
  }
}
