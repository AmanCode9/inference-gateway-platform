import { createHash } from "node:crypto";
import type { RedisConfig } from "../config/index.js";
import type { RedisLikeClient } from "../redis/client.js";
import { GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS } from "./idempotency.js";
import type { GovernanceStore, GovernanceStoreResult } from "./types.js";
import { GovernanceStoreUnavailableError } from "./types.js";

const GOVERNANCE_ENFORCEMENT_SCRIPT = `
local rate_key = KEYS[1]
local daily_key = KEYS[2]
local monthly_key = KEYS[3]
local admission_key = KEYS[4]

local rate_limit = tonumber(ARGV[1])
local rate_ttl_ms = tonumber(ARGV[2])
local daily_quota = tonumber(ARGV[3])
local estimated_tokens = tonumber(ARGV[4])
local daily_ttl_ms = tonumber(ARGV[5])
local monthly_budget = tonumber(ARGV[6])
local estimated_cost = tonumber(ARGV[7])
local monthly_ttl_ms = tonumber(ARGV[8])
local admission_ttl_ms = tonumber(ARGV[9])

if redis.call("EXISTS", admission_key) == 1 then
  local current_rate = tonumber(redis.call("GET", rate_key) or "0")
  local retry_after_ms = redis.call("PTTL", rate_key)
  if retry_after_ms < 0 then
    retry_after_ms = rate_ttl_ms
  end
  return { "allowed", tostring(current_rate), tostring(retry_after_ms), "duplicate" }
end

local current_rate = tonumber(redis.call("GET", rate_key) or "0")
if current_rate >= rate_limit then
  local retry_after_ms = redis.call("PTTL", rate_key)
  if retry_after_ms < 0 then
    retry_after_ms = rate_ttl_ms
  end
  return { "rate_limited", tostring(retry_after_ms) }
end

local current_daily = tonumber(redis.call("GET", daily_key) or "0")
if current_daily + estimated_tokens > daily_quota then
  return { "daily_token_quota_exceeded" }
end

local current_monthly = tonumber(redis.call("GET", monthly_key) or "0")
if current_monthly + estimated_cost > monthly_budget then
  return { "monthly_budget_exceeded" }
end

local next_rate = redis.call("INCRBY", rate_key, 1)
if next_rate == 1 then
  redis.call("PEXPIRE", rate_key, rate_ttl_ms)
end

local next_daily = redis.call("INCRBY", daily_key, estimated_tokens)
if next_daily == estimated_tokens then
  redis.call("PEXPIRE", daily_key, daily_ttl_ms)
end

local next_monthly = redis.call("INCRBY", monthly_key, estimated_cost)
if next_monthly == estimated_cost then
  redis.call("PEXPIRE", monthly_key, monthly_ttl_ms)
end

redis.call("SET", admission_key, "1", "PX", admission_ttl_ms)

local retry_after_ms = redis.call("PTTL", rate_key)
if retry_after_ms < 0 then
  retry_after_ms = rate_ttl_ms
end

return { "allowed", tostring(next_rate), tostring(retry_after_ms) }
`;

export interface RedisGovernanceStoreDependencies {
  readonly client: RedisLikeClient;
  readonly redis: RedisConfig;
}

export function createRedisGovernanceStore(
  dependencies: RedisGovernanceStoreDependencies
): GovernanceStore {
  return {
    enforceRequest: async (request) => {
      if (!dependencies.client.isOpen) {
        throw new GovernanceStoreUnavailableError();
      }

      const scope = hashApiKey(request.apiKey);
      const rateWindow = getRateWindow(request.occurredAtMs, request.rateLimit.windowSeconds);
      const dailyPeriod = getDailyPeriod(request.occurredAtMs);
      const monthlyPeriod = getMonthlyPeriod(request.occurredAtMs);
      const admissionKey = `${dependencies.redis.keyPrefix}:admission:${scope}:${hashValue(request.admissionId)}`;

      try {
        const result = (await dependencies.client.eval(GOVERNANCE_ENFORCEMENT_SCRIPT, {
          keys: [
            `${dependencies.redis.keyPrefix}:rate:${scope}:${rateWindow.windowStartMs}`,
            `${dependencies.redis.keyPrefix}:daily:${scope}:${dailyPeriod.label}`,
            `${dependencies.redis.keyPrefix}:monthly:${scope}:${monthlyPeriod.label}`,
            admissionKey
          ],
          arguments: [
            request.rateLimit.maxRequests.toString(),
            (rateWindow.expiresAtMs - request.occurredAtMs).toString(),
            request.dailyTokenQuota.toString(),
            request.usageEstimate.estimatedTokens.toString(),
            (dailyPeriod.expiresAtMs - request.occurredAtMs).toString(),
            request.monthlyBudgetLimitMinorUnits.toString(),
            request.usageEstimate.estimatedCostMinorUnits.toString(),
            (monthlyPeriod.expiresAtMs - request.occurredAtMs).toString(),
            GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS.toString()
          ]
        })) as string[] | null;

        return parseRedisResult(result, request.rateLimit.maxRequests);
      } catch {
        throw new GovernanceStoreUnavailableError();
      }
    },
    close: async () => {
      if (dependencies.client.isOpen) {
        await dependencies.client.quit();
      }
    }
  };
}

function parseRedisResult(
  result: string[] | null,
  maxRequests: number
): GovernanceStoreResult {
  if (!result || result.length === 0) {
    throw new GovernanceStoreUnavailableError();
  }

  if (result[0] === "allowed") {
    const usedRequests = Number(result[1] ?? "0");
    const retryAfterMs = Number(result[2] ?? "0");

    return {
      type: "allowed",
      remainingRequests: Math.max(0, maxRequests - usedRequests),
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000))
    };
  }

  if (result[0] === "rate_limited") {
    return {
      type: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil(Number(result[1] ?? "0") / 1_000))
    };
  }

  if (result[0] === "daily_token_quota_exceeded") {
    return {
      type: "daily_token_quota_exceeded"
    };
  }

  if (result[0] === "monthly_budget_exceeded") {
    return {
      type: "monthly_budget_exceeded"
    };
  }

  throw new GovernanceStoreUnavailableError();
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashApiKey(apiKey: string): string {
  return hashValue(apiKey);
}

function getRateWindow(occurredAtMs: number, windowSeconds: number): {
  readonly windowStartMs: number;
  readonly expiresAtMs: number;
} {
  const windowSizeMs = windowSeconds * 1_000;
  const windowStartMs = Math.floor(occurredAtMs / windowSizeMs) * windowSizeMs;

  return {
    windowStartMs,
    expiresAtMs: windowStartMs + windowSizeMs
  };
}

function getDailyPeriod(occurredAtMs: number): {
  readonly label: string;
  readonly expiresAtMs: number;
} {
  const now = new Date(occurredAtMs);
  const label = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const expiresAtMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);

  return {
    label,
    expiresAtMs
  };
}

function getMonthlyPeriod(occurredAtMs: number): {
  readonly label: string;
  readonly expiresAtMs: number;
} {
  const now = new Date(occurredAtMs);
  const label = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const expiresAtMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  return {
    label,
    expiresAtMs
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
