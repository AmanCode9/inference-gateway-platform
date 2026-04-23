import type { GatewayConfig, LogLevel } from "../config/index.js";

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
  readonly child: (fields: LogFields) => Logger;
}

const levelWeights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(config: Pick<GatewayConfig, "logLevel" | "serviceName">): Logger {
  return createJsonLogger(config, {});
}

function createJsonLogger(
  config: Pick<GatewayConfig, "logLevel" | "serviceName">,
  bindings: LogFields
): Logger {
  const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    if (levelWeights[level] < levelWeights[config.logLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: config.serviceName,
      message,
      ...bindings,
      ...fields
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (fields) => createJsonLogger(config, { ...bindings, ...fields })
  };
}
