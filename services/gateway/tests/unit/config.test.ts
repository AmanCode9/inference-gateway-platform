import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.js";

describe("loadConfig", () => {
  it("loads defaults for optional environment variables", () => {
    const config = loadConfig({
      GATEWAY_API_KEY: "test-key",
      REDIS_URL: "redis://localhost:6379"
    });

    expect(config).toMatchObject({
      nodeEnv: "development",
      port: 3000,
      serviceName: "inference-gateway",
      serviceVersion: "0.1.0",
      logLevel: "info",
      maxRequestBytes: 1_048_576,
      apiKey: "test-key"
    });
    expect(config.routing).toMatchObject({
      primaryProviderId: "mock",
      timeoutMs: 1_000,
      maxRetries: 1,
      retryBackoffMs: 50
    });
    expect(config.providerRegistry).toHaveLength(1);
    expect(config.providerRegistry[0]).toMatchObject({
      id: "mock",
      kind: "mock",
      behavior: "success"
    });
    expect(config.governance.redis.url).toBe("redis://localhost:6379");
    expect(config.governance.rateLimit).toMatchObject({
      maxRequests: 60,
      windowSeconds: 60
    });
    expect(config.governance.usage).toMatchObject({
      dailyTokenQuota: 20_000,
      monthlyBudgetLimitMinorUnits: 10_000,
      tokenEstimateCharsPerToken: 4,
      tokenCostPer1KMinorUnits: 25
    });
    expect(config.cache).toEqual({
      exactEnabled: false,
      backend: "memory",
      ttlSeconds: 86_400
    });
  });

  it("rejects an invalid port", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        PORT: "99999"
      })
    ).toThrow("PORT must be an integer");
  });

  it("requires a non-blank gateway API key", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "   ",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow("GATEWAY_API_KEY is required.");
  });

  it("rejects comma-containing gateway API keys at startup", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "alpha,beta",
        REDIS_URL: "redis://localhost:6379"
      })
    ).toThrow("GATEWAY_API_KEY must not contain commas.");
  });

  it("requires real provider settings when the stub adapter is configured", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        PRIMARY_PROVIDER_KIND: "real_stub"
      })
    ).toThrow("PRIMARY_REAL_PROVIDER_NAME is required.");
  });

  it("rejects duplicate provider IDs across routing slots", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        PRIMARY_PROVIDER_ID: "provider-a",
        SECONDARY_PROVIDER_KIND: "mock",
        SECONDARY_PROVIDER_ID: "provider-a"
      })
    ).toThrow("Provider IDs must be unique.");
  });

  it("rejects partial secondary provider configuration", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        SECONDARY_PROVIDER_ID: "backup-provider"
      })
    ).toThrow("SECONDARY_PROVIDER_KIND is required when secondary provider settings are present.");
  });

  it("rejects an invalid Redis URL", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "http://localhost:6379"
      })
    ).toThrow("REDIS_URL must use the redis:// or rediss:// scheme.");
  });

  it("rejects invalid timeout settings", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        PROVIDER_TIMEOUT_MS: "0"
      })
    ).toThrow("PROVIDER_TIMEOUT_MS must be an integer");
  });

  it("rejects invalid governance settings", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        RATE_LIMIT_MAX_REQUESTS: "0"
      })
    ).toThrow("RATE_LIMIT_MAX_REQUESTS must be an integer");
  });

  it("rejects contradictory abuse thresholds", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        ABUSE_MAX_MESSAGE_CHARACTERS: "20",
        ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS: "10"
      })
    ).toThrow(
      "ABUSE_MAX_TOTAL_MESSAGE_CHARACTERS must be greater than or equal to ABUSE_MAX_MESSAGE_CHARACTERS."
    );
  });

  it("loads exact cache configuration", () => {
    const config = loadConfig({
      GATEWAY_API_KEY: "test-key",
      REDIS_URL: "redis://localhost:6379",
      CACHE_ENABLED: "true",
      CACHE_BACKEND: "postgres",
      CACHE_TTL_SECONDS: "3600",
      CACHE_POSTGRES_OPERATION_TIMEOUT_MS: "125",
      DATABASE_URL: "postgres://user:pass@localhost:5432/inference_gateway"
    });

    expect(config.cache).toEqual({
      exactEnabled: true,
      backend: "postgres",
      ttlSeconds: 3_600,
      postgres: {
        databaseUrl: "postgres://user:pass@localhost:5432/inference_gateway",
        operationTimeoutMs: 125
      }
    });
  });

  it("keeps the Milestone 4A exact cache enabled variable compatible", () => {
    const config = loadConfig({
      GATEWAY_API_KEY: "test-key",
      REDIS_URL: "redis://localhost:6379",
      EXACT_CACHE_ENABLED: "true"
    });

    expect(config.cache.exactEnabled).toBe(true);
  });

  it("rejects invalid exact cache settings", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        EXACT_CACHE_ENABLED: "sometimes"
      })
    ).toThrow("EXACT_CACHE_ENABLED must be true or false.");
  });

  it("rejects conflicting exact cache enabled variables", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        CACHE_ENABLED: "true",
        EXACT_CACHE_ENABLED: "false"
      })
    ).toThrow("CACHE_ENABLED and EXACT_CACHE_ENABLED must not conflict.");
  });

  it("rejects a postgres cache backend without a database URL", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        CACHE_BACKEND: "postgres"
      })
    ).toThrow("DATABASE_URL is required.");
  });

  it("rejects unsupported cache backends", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        CACHE_BACKEND: "redis"
      })
    ).toThrow("CACHE_BACKEND must be one of memory or postgres.");
  });

  it("rejects invalid postgres cache URLs", () => {
    expect(() =>
      loadConfig({
        GATEWAY_API_KEY: "test-key",
        REDIS_URL: "redis://localhost:6379",
        CACHE_BACKEND: "postgres",
        DATABASE_URL: "mysql://localhost:3306/cache"
      })
    ).toThrow("DATABASE_URL must use the postgres:// or postgresql:// scheme.");
  });
});
