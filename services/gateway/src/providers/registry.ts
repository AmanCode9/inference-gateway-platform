import type { ProviderConfig } from "../config/index.js";
import { createProvider } from "./create-provider.js";
import type { ChatProvider } from "./types.js";

export interface ProviderRegistry {
  readonly getProvider: (providerId: string) => ChatProvider;
  readonly listProviderIds: () => readonly string[];
}

export function createProviderRegistry(providerConfigs: readonly ProviderConfig[]): ProviderRegistry {
  const providers = new Map<string, ChatProvider>();

  for (const providerConfig of providerConfigs) {
    providers.set(providerConfig.id, createProvider(providerConfig));
  }

  return {
    getProvider: (providerId) => {
      const provider = providers.get(providerId);

      if (!provider) {
        throw new Error(`Unknown provider ID: ${providerId}.`);
      }

      return provider;
    },
    listProviderIds: () => [...providers.keys()]
  };
}
