import type { ChatCompletionRequest } from "../chat/types.js";
import type { GovernanceConfig } from "../config/index.js";
import { HttpError, serviceUnavailable } from "../http/errors.js";
import type { Logger } from "../logging/logger.js";
import { assertRequestWithinAbuseLimits } from "./abuse-guard.js";
import { createChatCompletionAdmissionId } from "./idempotency.js";
import type { GovernanceStore, GovernanceUsageEstimate } from "./types.js";
import { GovernanceStoreUnavailableError } from "./types.js";
import { estimateChatUsage } from "./usage.js";

export interface GovernanceContext {
  readonly apiKey: string;
  readonly requestId: string;
  readonly logger: Logger;
}

export interface GovernanceAdmission {
  readonly usageEstimate: GovernanceUsageEstimate;
  readonly rateLimitRemaining: number;
}

export interface GovernanceService {
  admitChatCompletion(
    request: ChatCompletionRequest,
    context: GovernanceContext
  ): Promise<GovernanceAdmission>;
}

export interface GovernanceServiceDependencies {
  readonly config: GovernanceConfig;
  readonly store: GovernanceStore;
  readonly now?: () => number;
}

export function createGovernanceService(
  dependencies: GovernanceServiceDependencies
): GovernanceService {
  return new RequestGovernanceService(dependencies);
}

class RequestGovernanceService implements GovernanceService {
  private readonly config: GovernanceConfig;
  private readonly store: GovernanceStore;
  private readonly now: () => number;

  public constructor(dependencies: GovernanceServiceDependencies) {
    this.config = dependencies.config;
    this.store = dependencies.store;
    this.now = dependencies.now ?? Date.now;
  }

  public async admitChatCompletion(
    request: ChatCompletionRequest,
    context: GovernanceContext
  ): Promise<GovernanceAdmission> {
    assertRequestWithinAbuseLimits(request, this.config.abuse);

    const usageEstimate = estimateChatUsage(request, this.config.usage);
    const admissionId = createChatCompletionAdmissionId(context.requestId, request);

    try {
      const result = await this.store.enforceRequest({
        apiKey: context.apiKey,
        admissionId,
        occurredAtMs: this.now(),
        rateLimit: this.config.rateLimit,
        dailyTokenQuota: this.config.usage.dailyTokenQuota,
        monthlyBudgetLimitMinorUnits: this.config.usage.monthlyBudgetLimitMinorUnits,
        usageEstimate
      });

      if (result.type === "allowed") {
        context.logger.info("governance_admitted", {
          estimatedCostMinorUnits: usageEstimate.estimatedCostMinorUnits,
          estimatedTokens: usageEstimate.estimatedTokens,
          rateLimitRemaining: result.remainingRequests
        });

        return {
          usageEstimate,
          rateLimitRemaining: result.remainingRequests
        };
      }

      if (result.type === "rate_limited") {
        throw new HttpError(429, "rate_limit_exceeded", "Rate limit exceeded.", {
          "retry-after": result.retryAfterSeconds.toString()
        });
      }

      if (result.type === "daily_token_quota_exceeded") {
        throw tooManyRequests("daily_token_quota_exceeded", "Daily token quota exceeded.");
      }

      throw tooManyRequests("monthly_budget_exceeded", "Monthly budget exceeded.");
    } catch (error) {
      if (error instanceof GovernanceStoreUnavailableError) {
        throw serviceUnavailable("Usage governance is temporarily unavailable.", "governance_unavailable");
      }

      if (error instanceof HttpError) {
        context.logger.warn("governance_rejected", {
          code: error.code,
          statusCode: error.statusCode
        });
      }

      throw error;
    }
  }
}

function tooManyRequests(code: string, message: string): HttpError {
  return new HttpError(429, code, message);
}
