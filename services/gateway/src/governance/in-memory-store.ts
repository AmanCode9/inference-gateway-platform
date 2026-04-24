import { createHash } from "node:crypto";
import { GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS } from "./idempotency.js";
import type { GovernanceStore, GovernanceStoreResult } from "./types.js";
import { GovernanceStoreUnavailableError } from "./types.js";

export interface InMemoryGovernanceStoreOptions {
  readonly unavailable?: boolean;
}

interface CounterEntry {
  value: number;
  expiresAtMs: number;
}

interface AdmissionEntry {
  expiresAtMs: number;
}

export function createInMemoryGovernanceStore(
  options: InMemoryGovernanceStoreOptions = {}
): GovernanceStore {
  const counters = new Map<string, CounterEntry>();
  const admissions = new Map<string, AdmissionEntry>();

  return {
    enforceRequest: async (request) => {
      if (options.unavailable) {
        throw new GovernanceStoreUnavailableError();
      }

      const scope = hashApiKey(request.apiKey);
      const rateWindow = getRateWindow(request.occurredAtMs, request.rateLimit.windowSeconds);
      const rateKey = `rate:${scope}:${rateWindow.windowStartMs}`;
      const dailyPeriod = getDailyPeriod(request.occurredAtMs);
      const dailyKey = `daily:${scope}:${dailyPeriod.label}`;
      const monthlyPeriod = getMonthlyPeriod(request.occurredAtMs);
      const monthlyKey = `monthly:${scope}:${monthlyPeriod.label}`;
      const admissionKey = `admission:${scope}:${hashValue(request.admissionId)}`;

      if (isAdmissionRecorded(admissions, admissionKey, request.occurredAtMs)) {
        const currentRate = readCounter(counters, rateKey, request.occurredAtMs);

        return {
          type: "allowed",
          remainingRequests: Math.max(0, request.rateLimit.maxRequests - currentRate),
          retryAfterSeconds: Math.max(1, Math.ceil((rateWindow.expiresAtMs - request.occurredAtMs) / 1_000))
        } satisfies GovernanceStoreResult;
      }

      const currentRate = readCounter(counters, rateKey, request.occurredAtMs);

      if (currentRate >= request.rateLimit.maxRequests) {
        return {
          type: "rate_limited",
          retryAfterSeconds: Math.max(1, Math.ceil((rateWindow.expiresAtMs - request.occurredAtMs) / 1_000))
        } satisfies GovernanceStoreResult;
      }

      const currentDaily = readCounter(counters, dailyKey, request.occurredAtMs);

      if (currentDaily + request.usageEstimate.estimatedTokens > request.dailyTokenQuota) {
        return {
          type: "daily_token_quota_exceeded"
        } satisfies GovernanceStoreResult;
      }

      const currentMonthly = readCounter(counters, monthlyKey, request.occurredAtMs);

      if (currentMonthly + request.usageEstimate.estimatedCostMinorUnits > request.monthlyBudgetLimitMinorUnits) {
        return {
          type: "monthly_budget_exceeded"
        } satisfies GovernanceStoreResult;
      }

      const nextRate = writeCounter(counters, rateKey, currentRate + 1, rateWindow.expiresAtMs);
      writeCounter(
        counters,
        dailyKey,
        currentDaily + request.usageEstimate.estimatedTokens,
        dailyPeriod.expiresAtMs
      );
      writeCounter(
        counters,
        monthlyKey,
        currentMonthly + request.usageEstimate.estimatedCostMinorUnits,
        monthlyPeriod.expiresAtMs
      );
      admissions.set(admissionKey, {
        expiresAtMs: request.occurredAtMs + GOVERNANCE_ADMISSION_DEDUPLICATION_TTL_MS
      });

      return {
        type: "allowed",
        remainingRequests: Math.max(0, request.rateLimit.maxRequests - nextRate),
        retryAfterSeconds: Math.max(1, Math.ceil((rateWindow.expiresAtMs - request.occurredAtMs) / 1_000))
      } satisfies GovernanceStoreResult;
    },
    close: async () => {
      counters.clear();
      admissions.clear();
    }
  };
}

function isAdmissionRecorded(
  admissions: Map<string, AdmissionEntry>,
  key: string,
  occurredAtMs: number
): boolean {
  const entry = admissions.get(key);

  if (!entry) {
    return false;
  }

  if (entry.expiresAtMs <= occurredAtMs) {
    admissions.delete(key);
    return false;
  }

  return true;
}

function readCounter(counters: Map<string, CounterEntry>, key: string, occurredAtMs: number): number {
  const entry = counters.get(key);

  if (!entry) {
    return 0;
  }

  if (entry.expiresAtMs <= occurredAtMs) {
    counters.delete(key);
    return 0;
  }

  return entry.value;
}

function writeCounter(
  counters: Map<string, CounterEntry>,
  key: string,
  value: number,
  expiresAtMs: number
): number {
  counters.set(key, {
    value,
    expiresAtMs
  });

  return value;
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
