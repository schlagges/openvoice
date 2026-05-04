import { type ApiConfig } from "../config/env.js";
import type { Session } from "../db/models.js";
import { AuthService, toPublicUser } from "../modules/auth/service.js";
import { WorkspaceService } from "../modules/workspaces/service.js";
import { readRequestToken } from "../security/request-auth.js";
import { clearSessionCookie, createSessionCookie } from "./cookies.js";
import {
  ApiError,
  jsonResponse,
  methodNotAllowed,
  notFound,
  toErrorResponse,
  unauthorized,
} from "./errors.js";
import {
  parseCreateWorkspaceRequest,
  parseLoginRequest,
  parseRegisterRequest,
  readJsonObject,
} from "./validation.js";

export interface ApiHandlerOptions {
  readonly authService: AuthService;
  readonly config: Pick<
    ApiConfig,
    "sessionCookieName" | "sessionCookieSecure" | "sessionTtlSeconds"
  >;
  readonly workspaceService: WorkspaceService;
}

interface AuthenticatedRequest {
  readonly csrfRequired: boolean;
  readonly rawToken: string;
  readonly session: Session;
  readonly sessionId: string;
  readonly userId: string;
}

export function createApiHandler(
  options: ApiHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    try {
      const url = new URL(request.url);
      const response = await routeRequest(request, url, requestId, options);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

async function routeRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ApiHandlerOptions,
): Promise<Response> {
  if (url.pathname === "/api/v1/auth/register") {
    assertMethod(request, "POST");
    const result = await options.authService.register(
      parseRegisterRequest(await readJsonObject(request)),
    );
    return jsonResponse(
      {
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      },
      201,
      requestId,
      {
        "set-cookie": createSessionCookie(result.rawSessionToken, {
          maxAgeSeconds: options.config.sessionTtlSeconds,
          name: options.config.sessionCookieName,
          secure: options.config.sessionCookieSecure,
        }),
      },
    );
  }

  if (url.pathname === "/api/v1/auth/login") {
    assertMethod(request, "POST");
    const result = await options.authService.login(
      parseLoginRequest(await readJsonObject(request)),
    );
    return jsonResponse(
      {
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      },
      200,
      requestId,
      {
        "set-cookie": createSessionCookie(result.rawSessionToken, {
          maxAgeSeconds: options.config.sessionTtlSeconds,
          name: options.config.sessionCookieName,
          secure: options.config.sessionCookieSecure,
        }),
      },
    );
  }

  if (url.pathname === "/api/v1/auth/logout") {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    await options.authService.logout(authenticated.rawToken);

    return jsonResponse({ ok: true }, 200, requestId, {
      "set-cookie": clearSessionCookie({
        name: options.config.sessionCookieName,
        secure: options.config.sessionCookieSecure,
      }),
    });
  }

  if (url.pathname === "/api/v1/me") {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    const authResult = await options.authService.authenticate(authenticated.rawToken);

    if (!authResult) {
      throw unauthorized();
    }

    return jsonResponse({ user: toPublicUser(authResult.user) }, 200, requestId);
  }

  if (url.pathname === "/api/v1/workspaces") {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const result = await options.workspaceService.createWorkspace({
      ...parseCreateWorkspaceRequest(await readJsonObject(request)),
      ownerId: authenticated.userId,
    });

    return jsonResponse(result, 201, requestId);
  }

  throw notFound();
}

async function authenticateRequest(
  request: Request,
  options: ApiHandlerOptions,
): Promise<AuthenticatedRequest> {
  const requestToken = readRequestToken(request, options.config.sessionCookieName);

  if (!requestToken) {
    throw unauthorized();
  }

  const authResult = await options.authService.authenticate(requestToken.token);

  if (!authResult) {
    throw unauthorized();
  }

  return {
    csrfRequired: requestToken.transport === "cookie",
    rawToken: requestToken.token,
    session: authResult.session,
    sessionId: authResult.session.id,
    userId: authResult.user.id,
  };
}

function assertCsrf(
  request: Request,
  authenticated: AuthenticatedRequest,
  options: ApiHandlerOptions,
): void {
  if (!authenticated.csrfRequired) {
    return;
  }

  const csrfToken = request.headers.get("x-openvoice-csrf-token");
  if (!csrfToken) {
    throw new ApiError(403, "FORBIDDEN", "Missing CSRF token.");
  }

  if (!options.authService.verifyCsrfToken(authenticated.session, csrfToken)) {
    throw new ApiError(403, "FORBIDDEN", "Invalid CSRF token.");
  }
}

function assertMethod(request: Request, expectedMethod: string): void {
  if (request.method !== expectedMethod) {
    throw methodNotAllowed();
  }
}
