export interface ProviderMetricsSnapshot {
  readonly providerSelected: Readonly<Record<string, number>>;
  readonly providerSuccess: Readonly<Record<string, number>>;
  readonly providerFailure: Readonly<Record<string, number>>;
  readonly retryCount: number;
  readonly fallbackCount: number;
  readonly timeoutCount: number;
}

export interface ProviderMetrics {
  readonly recordProviderSelected: (provider: string) => void;
  readonly recordProviderSuccess: (provider: string) => void;
  readonly recordProviderFailure: (provider: string) => void;
  readonly recordRetry: () => void;
  readonly recordFallback: () => void;
  readonly recordTimeout: () => void;
  readonly snapshot: () => ProviderMetricsSnapshot;
}

export function createProviderMetrics(): ProviderMetrics {
  const providerSelected = new Map<string, number>();
  const providerSuccess = new Map<string, number>();
  const providerFailure = new Map<string, number>();
  let retryCount = 0;
  let fallbackCount = 0;
  let timeoutCount = 0;

  return {
    recordProviderSelected: (provider) => increment(providerSelected, provider),
    recordProviderSuccess: (provider) => increment(providerSuccess, provider),
    recordProviderFailure: (provider) => increment(providerFailure, provider),
    recordRetry: () => {
      retryCount += 1;
    },
    recordFallback: () => {
      fallbackCount += 1;
    },
    recordTimeout: () => {
      timeoutCount += 1;
    },
    snapshot: () => ({
      providerSelected: toObject(providerSelected),
      providerSuccess: toObject(providerSuccess),
      providerFailure: toObject(providerFailure),
      retryCount,
      fallbackCount,
      timeoutCount
    })
  };
}

function increment(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function toObject(counter: Map<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(counter.entries()) as Record<string, number>);
}
