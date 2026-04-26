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
  readonly governance: GovernanceConfig;
  readonly cache: CacheConfig;
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

export interface RedisConfig {
  readonly url: string;
  readonly keyPrefix: string;
  readonly connectTimeoutMs: number;
}

export interface RateLimitConfig {
  readonly maxRequests: number;
  readonly windowSeconds: number;
}

export interface UsageGovernanceConfig {
  readonly dailyTokenQuota: number;
  readonly monthlyBudgetLimitMinorUnits: number;
  readonly tokenEstimateCharsPerToken: number;
  readonly tokenCostPer1KMinorUnits: number;
}

export interface AbuseProtectionConfig {
  readonly maxMessageCount: number;
  readonly maxMessageCharacters: number;
  readonly maxTotalMessageCharacters: number;
}

export interface GovernanceConfig {
  readonly redis: RedisConfig;
  readonly rateLimit: RateLimitConfig;
  readonly usage: UsageGovernanceConfig;
  readonly abuse: AbuseProtectionConfig;
}

export interface CacheConfig {
  readonly exactEnabled: boolean;
}

export type ProviderConfig = MockProviderConfig | RealStubProviderConfig;
export type GatewayConfig = GatewayConfigBase;

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576;
const DEFAULT_PROVIDER_TIMEOUT_MS = 1_000;
const DEFAULT_PROVIDER_MAX_RETRIES = 1;
const DEFAULT_PROVIDER_RETRY_BACKOFF_MS = 50;
const DEFAULT_PRIMARY_PROVIDER_ID = "mock";
const DEFAULT_REDIS_KEY_PREFIX = "inference-gateway";
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 2_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_DAILY_TOKEN_QUOTA = 20_000;
const DEFAULT_MONTHLY_BUDGET_LIMIT_MINOR_UNITS = 10_000;
const DEFAULT_TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4;
const DEFAULT_TOKEN_COST_PER_1K_MINOR_UNITS = 25;
const DEFAULT_ABUSE_MAX_MESSAGE_COUNT = 32;
const DEFAULT_ABUSE_MAX_MESSAGE_CHARACTERS = 4_000;
const DEFAULT_ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS = 12_000;
const DEFAULT_EXACT_CACHE_ENABLED = false;

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

  const governance: GovernanceConfig = validateGovernanceConfig({
    redis: {
      url: readRedisUrl(env.REDIS_URL),
      keyPrefix: readString(env.REDIS_KEY_PREFIX, DEFAULT_REDIS_KEY_PREFIX),
      connectTimeoutMs: readInteger(
        env.REDIS_CONNECT_TIMEOUT_MS,
        "REDIS_CONNECT_TIMEOUT_MS",
        DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
        1,
        60_000
      )
    },
    rateLimit: {
      maxRequests: readInteger(
        env.RATE_LIMIT_MAX_REQUESTS,
        "RATE_LIMIT_MAX_REQUESTS",
        DEFAULT_RATE_LIMIT_MAX_REQUESTS,
        1,
        1_000_000
      ),
      windowSeconds: readInteger(
        env.RATE_LIMIT_WINDOW_SECONDS,
        "RATE_LIMIT_WINDOW_SECONDS",
        DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
        1,
        86_400
      )
    },
    usage: {
      dailyTokenQuota: readInteger(
        env.DAILY_TOKEN_QUOTA,
        "DAILY_TOKEN_QUOTA",
        DEFAULT_DAILY_TOKEN_QUOTA,
        1,
        1_000_000_000
      ),
      monthlyBudgetLimitMinorUnits: readInteger(
        env.MONTHLY_BUDGET_LIMIT_MINOR_UNITS,
        "MONTHLY_BUDGET_LIMIT_MINOR_UNITS",
        DEFAULT_MONTHLY_BUDGET_LIMIT_MINOR_UNITS,
        1,
        1_000_000_000
      ),
      tokenEstimateCharsPerToken: readInteger(
        env.TOKEN_ESTIMATE_CHARS_PER_TOKEN,
        "TOKEN_ESTIMATE_CHARS_PER_TOKEN",
        DEFAULT_TOKEN_ESTIMATE_CHARS_PER_TOKEN,
        1,
        1_000
      ),
      tokenCostPer1KMinorUnits: readInteger(
        env.TOKEN_COST_PER_1K_MINOR_UNITS,
        "TOKEN_COST_PER_1K_MINOR_UNITS",
        DEFAULT_TOKEN_COST_PER_1K_MINOR_UNITS,
        1,
        1_000_000
      )
    },
    abuse: {
      maxMessageCount: readInteger(
        env.ABUSE_MAX_MESSAGE_COUNT,
        "ABUSE_MAX_MESSAGE_COUNT",
        DEFAULT_ABUSE_MAX_MESSAGE_COUNT,
        1,
        10_000
      ),
      maxMessageCharacters: readInteger(
        env.ABUSE_MAX_MESSAGE_CHARACTERS,
        "ABUSE_MAX_MESSAGE_CHARACTERS",
        DEFAULT_ABUSE_MAX_MESSAGE_CHARACTERS,
        1,
        1_000_000
      ),
      maxTotalMessageCharacters: readInteger(
        env.ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS,
        "ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS",
        DEFAULT_ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS,
        1,
        10_000_000
      )
    }
  });

  return {
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
    routing,
    governance,
    cache: {
      exactEnabled: readBoolean(
        env.EXACT_CACHE_ENABLED,
        "EXACT_CACHE_ENABLED",
        DEFAULT_EXACT_CACHE_ENABLED
      )
    }
  };
}

function validateGovernanceConfig(config: GovernanceConfig): GovernanceConfig {
  if (config.redis.keyPrefix.includes(",")) {
    throw new Error("REDIS_KEY_PREFIX must not contain commas.");
  }

  if (config.abuse.maxTotalMessageCharacters < config.abuse.maxMessageCharacters) {
    throw new Error(
      "ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS must be greater than or equal to ABUSE_MAX_MESSAGE_CHARACTERS."
    );
  }

  return config;
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

function readRedisUrl(value: string | undefined): string {
  const rawValue = readRequiredString(value, "REDIS_URL");

  try {
    const parsed = new URL(rawValue);

    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use the redis:// or rediss:// scheme.");
    }

    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message === "REDIS_URL must use the redis:// or rediss:// scheme.") {
      throw error;
    }

    throw new Error("REDIS_URL must be a valid Redis URL.");
  }
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

function readBoolean(value: string | undefined, name: string, fallback: boolean): boolean {
  const rawValue = value?.trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (rawValue === "true" || rawValue === "1") {
    return true;
  }

  if (rawValue === "false" || rawValue === "0") {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
}

function readLogLevel(value: string | undefined): LogLevel {
  const rawValue = value?.trim() ?? "info";

  if (rawValue === "debug" || rawValue === "info" || rawValue === "warn" || rawValue === "error") {
    return rawValue;
  }

  throw new Error("LOG_LEVEL must be one of debug, info, warn, or error.");
}

function readProviderKind(value: string | undefined, name = "PROVIDER_KIND"): ProviderKind {
  const rawValue = value?.trim() ?? "mock";

  if (rawValue === "mock" || rawValue === "real_stub") {
    return rawValue;
  }

  throw new Error(`${name} must be one of mock or real_stub.`);
}

function readProviderConfig(
  env: NodeJS.ProcessEnv,
  prefix: "PRIMARY" | "SECONDARY",
  options: {
    readonly defaultId: string;
    readonly defaultKind: ProviderKind;
  }
): ProviderConfig {
  const kind = readProviderKind(env[`${prefix}_PROVIDER_KIND`] ?? options.defaultKind, `${prefix}_PROVIDER_KIND`);
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
  if (!hasSecondaryProviderSettings(env)) {
    return undefined;
  }

  const rawKind = env[`${prefix}_PROVIDER_KIND`]?.trim();

  if (!rawKind) {
    throw new Error("SECONDARY_PROVIDER_KIND is required when secondary provider settings are present.");
  }

  return readProviderConfig(env, prefix, {
    defaultId: "secondary-provider",
    defaultKind: readProviderKind(rawKind, "SECONDARY_PROVIDER_KIND")
  });
}

function hasSecondaryProviderSettings(env: NodeJS.ProcessEnv): boolean {
  const names = [
    "SECONDARY_PROVIDER_KIND",
    "SECONDARY_PROVIDER_ID",
    "SECONDARY_MOCK_BEHAVIOR",
    "SECONDARY_MOCK_DELAY_MS",
    "SECONDARY_REAL_PROVIDER_NAME",
    "SECONDARY_REAL_PROVIDER_BASE_URL"
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
