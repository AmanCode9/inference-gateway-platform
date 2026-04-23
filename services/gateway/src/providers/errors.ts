export class ProviderError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(statusCode: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

export function isAbortLikeError(value: unknown): boolean {
  if (value instanceof Error) {
    return value.name === "AbortError" || value.message === "Provider execution timed out.";
  }

  return false;
}
