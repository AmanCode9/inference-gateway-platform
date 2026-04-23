export type LogLevel = "debug" | "info" | "warn" | "error";
export type ProviderKind = "mock" | "real_stub";
export type MockProviderBehavior =
  | "success"
  | "retryable_failure"
  | "non_retryable_failure"
  | "timeout"
  | "flaky_once";

interface GatewayConfigBase {
  readonly nodeEnv: string;
  readonly port: number;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly logLevel: LogLevel;
  readonly maxRequestBytes: number;
  readonly apiKey: string;
  readonly providerRegistry: readonly ProviderConfig[];
  readonly routing: ProviderRoutingConfig;
}

export interface ProviderRoutingConfig {
  readonly primaryProviderId: string;
  readonly secondaryProviderId?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
}

export interface MockProviderConfig {
  readonly id: string;
  readonly kind: "mock";
  readonly behavior: MockProviderBehavior;
  readonly delayMs: number;
}

export interface RealStubProviderConfig {
  readonly id: string;
  readonly kind: "real_stub";
  readonly upstreamName: string;
  readonly baseUrl: string;
}

export type ProviderConfig = MockProviderConfig | RealStubProviderConfig;
export type GatewayConfig = GatewayConfigBase;

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576;
const DEFAULT_PROVIDER_TIMEOUT_MS = 1_000;
const DEFAULT_PROVIDER_MAX_RETRIES = 1;
const DEFAULT_PROVIDER_RETRY_BACKOFF_MS = 50;
const DEFAULT_PRIMARY_PROVIDER_ID = "mock";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const primaryProviderConfig = readProviderConfig(env, "PRIMARY", {
    defaultId: DEFAULT_PRIMARY_PROVIDER_ID,
    defaultKind: readProviderKind(env.PRIMARY_PROVIDER_KIND ?? env.PROVIDER_KIND)
  });
  const secondaryProviderConfig = readOptionalProviderConfig(env, "SECONDARY");
  const providerRegistry = secondaryProviderConfig
    ? validateProviderRegistry([primaryProviderConfig, secondaryProviderConfig])
    : validateProviderRegistry([primaryProviderConfig]);

  const routingBase = {
    primaryProviderId: primaryProviderConfig.id,
    timeoutMs: readInteger(
      env.PROVIDER_TIMEOUT_MS,
      "PROVIDER_TIMEOUT_MS",
      DEFAULT_PROVIDER_TIMEOUT_MS,
      1,
      60_000
    ),
    maxRetries: readInteger(
      env.PROVIDER_MAX_RETRIES,
      "PROVIDER_MAX_RETRIES",
      DEFAULT_PROVIDER_MAX_RETRIES,
      0,
      5
    ),
    retryBackoffMs: readInteger(
      env.PROVIDER_RETRY_BACKOFF_MS,
      "PROVIDER_RETRY_BACKOFF_MS",
      DEFAULT_PROVIDER_RETRY_BACKOFF_MS,
      0,
      10_000
    )
  };
  const routing: ProviderRoutingConfig = secondaryProviderConfig
    ? {
        ...routingBase,
        secondaryProviderId: secondaryProviderConfig.id
      }
    : routingBase;

  const baseConfig: GatewayConfigBase = {
    nodeEnv: readString(env.NODE_ENV, "development"),
    port: readInteger(env.PORT, "PORT", DEFAULT_PORT, 1, 65_535),
    serviceName: readString(env.SERVICE_NAME, "inference-gateway"),
    serviceVersion: readString(env.SERVICE_VERSION, "0.1.0"),
    logLevel: readLogLevel(env.LOG_LEVEL),
    apiKey: readApiKey(env.GATEWAY_API_KEY),
    maxRequestBytes: readInteger(
      env.MAX_REQUEST_BYTES,
      "MAX_REQUEST_BYTES",
      DEFAULT_MAX_REQUEST_BYTES,
      1,
      10_485_760
    ),
    providerRegistry,
    routing
  };

  return baseConfig;
}

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readRequiredString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }

  return trimmed;
}

function readApiKey(value: string | undefined): string {
  const apiKey = readRequiredString(value, "GATEWAY_API_KEY");

  if (apiKey.includes(",")) {
    throw new Error("GATEWAY_API_KEY must not contain commas.");
  }

  return apiKey;
}

function readInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const rawValue = value?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function readLogLevel(value: string | undefined): LogLevel {
  const rawValue = value?.trim() ?? "info";

  if (rawValue === "debug" || rawValue === "info" || rawValue === "warn" || rawValue === "error") {
    return rawValue;
  }

  throw new Error("LOG_LEVEL must be one of debug, info, warn, or error.");
}

function readProviderKind(value: string | undefined): ProviderKind {
  const rawValue = value?.trim() ?? "mock";

  if (rawValue === "mock" || rawValue === "real_stub") {
    return rawValue;
  }

  throw new Error("PROVIDER_KIND must be one of mock or real_stub.");
}

function readProviderConfig(
  env: NodeJS.ProcessEnv,
  prefix: "PRIMARY" | "SECONDARY",
  options: {
    readonly defaultId: string;
    readonly defaultKind: ProviderKind;
  }
): ProviderConfig {
  const kind = readProviderKind(env[`${prefix}_PROVIDER_KIND`] ?? options.defaultKind);
  const id = readProviderId(env[`${prefix}_PROVIDER_ID`], `${prefix}_PROVIDER_ID`, options.defaultId);

  if (kind === "real_stub") {
    const upstreamName = readRequiredString(
      env[`${prefix}_REAL_PROVIDER_NAME`] ?? readLegacyRealProviderName(env, prefix),
      `${prefix}_REAL_PROVIDER_NAME`
    );

    return {
      id,
      kind,
      upstreamName,
      baseUrl: readUrlString(
        env[`${prefix}_REAL_PROVIDER_BASE_URL`] ?? readLegacyRealProviderBaseUrl(env, prefix),
        `${prefix}_REAL_PROVIDER_BASE_URL`
      )
    };
  }

  return {
    id,
    kind,
    behavior: readMockProviderBehavior(env[`${prefix}_MOCK_BEHAVIOR`]),
    delayMs: readInteger(
      env[`${prefix}_MOCK_DELAY_MS`],
      `${prefix}_MOCK_DELAY_MS`,
      0,
      0,
      60_000
    )
  };
}

function readOptionalProviderConfig(env: NodeJS.ProcessEnv, prefix: "SECONDARY"): ProviderConfig | undefined {
  if (!hasProviderSettings(env, prefix)) {
    return undefined;
  }

  const rawKind = env[`${prefix}_PROVIDER_KIND`]?.trim();

  if (!rawKind) {
    throw new Error(`${prefix}_PROVIDER_KIND is required when secondary provider settings are present.`);
  }

  return readProviderConfig(env, prefix, {
    defaultId: "secondary-provider",
    defaultKind: readProviderKind(rawKind)
  });
}

function hasProviderSettings(env: NodeJS.ProcessEnv, prefix: "SECONDARY"): boolean {
  const names = [
    `${prefix}_PROVIDER_KIND`,
    `${prefix}_PROVIDER_ID`,
    `${prefix}_MOCK_BEHAVIOR`,
    `${prefix}_MOCK_DELAY_MS`,
    `${prefix}_REAL_PROVIDER_NAME`,
    `${prefix}_REAL_PROVIDER_BASE_URL`
  ] as const;

  return names.some((name) => env[name] !== undefined);
}

function readProviderId(value: string | undefined, name: string, fallback: string): string {
  const providerId = readString(value, fallback);

  if (providerId.includes(",")) {
    throw new Error(`${name} must not contain commas.`);
  }

  return providerId;
}

function readMockProviderBehavior(value: string | undefined): MockProviderBehavior {
  const rawValue = value?.trim() ?? "success";

  if (
    rawValue === "success" ||
    rawValue === "retryable_failure" ||
    rawValue === "non_retryable_failure" ||
    rawValue === "timeout" ||
    rawValue === "flaky_once"
  ) {
    return rawValue;
  }

  throw new Error(
    "Mock provider behavior must be one of success, retryable_failure, non_retryable_failure, timeout, or flaky_once."
  );
}

function validateProviderRegistry(providerConfigs: readonly ProviderConfig[]): readonly ProviderConfig[] {
  const ids = new Set<string>();

  for (const providerConfig of providerConfigs) {
    if (ids.has(providerConfig.id)) {
      throw new Error(`Provider IDs must be unique. Duplicate ID: ${providerConfig.id}.`);
    }

    ids.add(providerConfig.id);
  }

  return providerConfigs;
}

function readLegacyRealProviderName(env: NodeJS.ProcessEnv, prefix: "PRIMARY" | "SECONDARY"): string | undefined {
  return prefix === "PRIMARY" ? env.REAL_PROVIDER_NAME : undefined;
}

function readLegacyRealProviderBaseUrl(env: NodeJS.ProcessEnv, prefix: "PRIMARY" | "SECONDARY"): string | undefined {
  return prefix === "PRIMARY" ? env.REAL_PROVIDER_BASE_URL : undefined;
}

function readUrlString(value: string | undefined, name: string): string {
  const rawValue = readRequiredString(value, name);

  try {
    const parsed = new URL(rawValue);
    return parsed.toString();
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}
