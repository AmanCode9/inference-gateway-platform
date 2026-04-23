export type LogLevel = "debug" | "info" | "warn" | "error";
export type ProviderKind = "mock" | "real_stub";

interface GatewayConfigBase {
  readonly nodeEnv: string;
  readonly port: number;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly logLevel: LogLevel;
  readonly maxRequestBytes: number;
  readonly apiKey: string;
}

export interface MockGatewayConfig extends GatewayConfigBase {
  readonly providerKind: "mock";
}

export interface RealStubGatewayConfig extends GatewayConfigBase {
  readonly providerKind: "real_stub";
  readonly realProviderName: string;
  readonly realProviderBaseUrl: string;
}

export type GatewayConfig = MockGatewayConfig | RealStubGatewayConfig;

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
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
    )
  };

  const providerKind = readProviderKind(env.PROVIDER_KIND);

  if (providerKind === "real_stub") {
    return {
      ...baseConfig,
      providerKind,
      realProviderName: readRequiredString(env.REAL_PROVIDER_NAME, "REAL_PROVIDER_NAME"),
      realProviderBaseUrl: readUrlString(env.REAL_PROVIDER_BASE_URL, "REAL_PROVIDER_BASE_URL")
    };
  }

  return {
    ...baseConfig,
    providerKind
  };
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

function readUrlString(value: string | undefined, name: string): string {
  const rawValue = readRequiredString(value, name);

  try {
    const parsed = new URL(rawValue);
    return parsed.toString();
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}
