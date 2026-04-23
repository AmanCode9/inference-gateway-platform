export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly headers: Readonly<Record<string, string>>;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    headers: Readonly<Record<string, string>> = {}
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.headers = headers;
  }
}

export function isHttpError(value: unknown): value is HttpError {
  return value instanceof HttpError;
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "invalid_request", message);
}

export function unauthorized(message = "Missing or invalid API key."): HttpError {
  return new HttpError(401, "unauthorized", message);
}

export function unsupportedMediaType(message = "Content-Type must be application/json."): HttpError {
  return new HttpError(415, "unsupported_media_type", message);
}

export function methodNotAllowed(allowedMethods: readonly string[]): HttpError {
  return new HttpError(405, "method_not_allowed", "Method not allowed.", {
    allow: allowedMethods.join(", ")
  });
}

export function notFound(message = "Route not found."): HttpError {
  return new HttpError(404, "not_found", message);
}

export function notImplemented(message: string, code = "not_implemented"): HttpError {
  return new HttpError(501, code, message);
}

export function serviceUnavailable(message: string, code = "service_unavailable"): HttpError {
  return new HttpError(503, code, message);
}

export function gatewayTimeout(message: string, code = "gateway_timeout"): HttpError {
  return new HttpError(504, code, message);
}
