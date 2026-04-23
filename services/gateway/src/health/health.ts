import type { GatewayConfig } from "../config/index.js";

export interface HealthStatus {
  readonly status: "ok";
  readonly service: string;
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}

export function getHealthStatus(config: Pick<GatewayConfig, "serviceName" | "serviceVersion">): HealthStatus {
  return {
    status: "ok",
    service: config.serviceName,
    version: config.serviceVersion,
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString()
  };
}
