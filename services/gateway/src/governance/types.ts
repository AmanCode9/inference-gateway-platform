import type { RateLimitConfig } from "../config/index.js";

export interface GovernanceUsageEstimate {
  readonly estimatedTokens: number;
  readonly estimatedCostMinorUnits: number;
  readonly totalCharacters: number;
}

export interface GovernanceStoreRequest {
  readonly apiKey: string;
  readonly admissionId: string;
  readonly occurredAtMs: number;
  readonly rateLimit: RateLimitConfig;
  readonly dailyTokenQuota: number;
  readonly monthlyBudgetLimitMinorUnits: number;
  readonly usageEstimate: GovernanceUsageEstimate;
}

export type GovernanceStoreResult =
  | {
      readonly type: "allowed";
      readonly remainingRequests: number;
      readonly retryAfterSeconds: number;
    }
  | {
      readonly type: "rate_limited";
      readonly retryAfterSeconds: number;
    }
  | {
      readonly type: "daily_token_quota_exceeded";
    }
  | {
      readonly type: "monthly_budget_exceeded";
    };

export interface GovernanceStore {
  enforceRequest(request: GovernanceStoreRequest): Promise<GovernanceStoreResult>;
  close(): Promise<void>;
}

export class GovernanceStoreUnavailableError extends Error {
  public constructor(message = "Governance store is unavailable.") {
    super(message);
    this.name = "GovernanceStoreUnavailableError";
  }
}
