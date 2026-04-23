export type LogLevel = "debug" | "info" | "warn" | "error";

export interface GatewayConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly logLevel: LogLevel;
  readonly maxRequestBytes: number;
}

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    nodeEnv: readString(env.NODE_ENV, "development"),
    port: readInteger(env.PORT, "PORT", DEFAULT_PORT, 1, 65_535),
    serviceName: readString(env.SERVICE_NAME, "inference-gateway"),
    serviceVersion: readString(env.SERVICE_VERSION, "0.1.0"),
    logLevel: readLogLevel(env.LOG_LEVEL),
    maxRequestBytes: readInteger(
      env.MAX_REQUEST_BYTES,
      "MAX_REQUEST_BYTES",
      DEFAULT_MAX_REQUEST_BYTES,
      1,
      10_485_760
    )
  };
}

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
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
