export type ApiErrorCode =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNAUTHORIZED";

export type ErrorDetails = Record<string, string | number | boolean | null>;

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly details?: ErrorDetails;
  public readonly status: number;

  public constructor(status: number, code: ApiErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

export function badRequest(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function conflict(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(409, "CONFLICT", message, details);
}

export function forbidden(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(403, "FORBIDDEN", message, details);
}

export function methodNotAllowed(message = "Method not allowed."): ApiError {
  return new ApiError(405, "METHOD_NOT_ALLOWED", message);
}

export function notFound(message = "Route not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function rateLimited(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(429, "RATE_LIMITED", message, details);
}

export function unauthorized(message = "Authentication required."): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "Internal server error.");

  return jsonResponse(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        requestId,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
    },
    apiError.status,
    requestId,
  );
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(isRateLimitBody(body)
        ? { "retry-after": String(body.error.details.retryAfterSeconds) }
        : {}),
      "x-request-id": requestId,
      ...headers,
    },
  });
}

function isRateLimitBody(body: unknown): body is {
  readonly error: {
    readonly code: "RATE_LIMITED";
    readonly details: { readonly retryAfterSeconds: number };
  };
} {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return false;
  }

  const error = (body as { readonly error: unknown }).error;
  if (!error || typeof error !== "object" || !("code" in error) || !("details" in error)) {
    return false;
  }

  const details = (error as { readonly details: unknown }).details;
  return (
    (error as { readonly code: unknown }).code === "RATE_LIMITED" &&
    Boolean(details && typeof details === "object") &&
    typeof (details as { readonly retryAfterSeconds?: unknown }).retryAfterSeconds === "number"
  );
}
