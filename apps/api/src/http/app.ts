import { type ApiConfig } from "../config/env.js";
import type { Session } from "../db/models.js";
import { AuthService, toPublicUser } from "../modules/auth/service.js";
import { ChannelService } from "../modules/channels/service.js";
import { MessageService } from "../modules/messages/service.js";
import { ModerationService } from "../modules/moderation/service.js";
import { ObservabilityService } from "../modules/observability/service.js";
import { VoiceService } from "../modules/voice/service.js";
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
import { ApiRequestRateLimiter } from "./request-rate-limit.js";
import {
  applyHttpSecurityHeaders,
  assertTrustedCsrfOrigin,
  createCorsPreflightResponse,
} from "./security.js";
import {
  parseCreateChannelRequest,
  parseCreateMessageRequest,
  parseCreateWorkspaceRequest,
  parseListAuditLogQuery,
  parseListMessagesQuery,
  parseLoginRequest,
  parseModerationReasonRequest,
  parsePermissionOverrideRequest,
  parsePermissionOverrideTargetType,
  parseRegisterRequest,
  parseReorderChannelsRequest,
  parseRtcStatsRequest,
  parseTimeoutMemberRequest,
  parseUpdateMessageRequest,
  parseUuidPathParameter,
  parseVoiceJoinRequest,
  parseVoiceMemberModerationRequest,
  parseVoiceModerationRequest,
  parseVoiceMoveRequest,
  parseVoiceSelfStateRequest,
  readJsonObject,
} from "./validation.js";

export interface ApiHandlerOptions {
  readonly authService: AuthService;
  readonly channelService: ChannelService;
  readonly config: Pick<
    ApiConfig,
    | "corsAllowedOrigins"
    | "enableHsts"
    | "sessionCookieName"
    | "sessionCookieSecure"
    | "sessionTtlSeconds"
  >;
  readonly messageService: MessageService;
  readonly moderationService?: ModerationService;
  readonly observabilityService?: ObservabilityService;
  readonly rateLimiter?: ApiRequestRateLimiter;
  readonly voiceService?: VoiceService;
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
  const rateLimiter = options.rateLimiter ?? new ApiRequestRateLimiter();

  return async (request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);

    try {
      const response =
        request.method === "OPTIONS"
          ? createCorsPreflightResponse(request, options.config, requestId)
          : await routeRequest(request, url, requestId, options, rateLimiter);
      response.headers.set("x-request-id", requestId);
      options.observabilityService?.metrics.recordHttpRequest({
        method: request.method,
        status: response.status,
      });
      return applyHttpSecurityHeaders(response, request, options.config);
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "Internal server error.");
      options.observabilityService?.metrics.recordApiError({
        code: apiError.code,
        status: apiError.status,
      });
      if (apiError.status === 403) {
        options.observabilityService?.metrics.recordPermissionDenied();
      }
      if (apiError.status >= 500) {
        logApiError({ apiError, method: request.method, path: url.pathname, requestId });
      }
      options.observabilityService?.metrics.recordHttpRequest({
        method: request.method,
        status: apiError.status,
      });
      return applyHttpSecurityHeaders(toErrorResponse(error, requestId), request, options.config);
    }
  };
}

async function routeRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ApiHandlerOptions,
  rateLimiter: ApiRequestRateLimiter,
): Promise<Response> {
  rateLimiter.assertAllowed(request, url);

  if (url.pathname === "/healthz") {
    assertMethod(request, "GET");
    return jsonResponse(requireObservabilityService(options).liveness(), 200, requestId);
  }

  if (url.pathname === "/readyz") {
    assertMethod(request, "GET");
    const readiness = await requireObservabilityService(options).readiness();
    return jsonResponse(readiness, readiness.status === "ok" ? 200 : 503, requestId);
  }

  if (url.pathname === "/metrics") {
    assertMethod(request, "GET");
    const body = await requireObservabilityService(options).metricsText();
    return new Response(body, {
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "x-request-id": requestId,
      },
      status: 200,
    });
  }

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

  if (url.pathname === "/api/v1/turn/credentials") {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    return jsonResponse(
      requireVoiceService(options).createIceServers(authenticated.userId),
      200,
      requestId,
    );
  }

  if (url.pathname === "/api/v1/rtc/stats") {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const body = parseRtcStatsRequest(await readJsonObject(request));
    await requireObservabilityService(options).ingestRtcStats({
      sample: {
        ...body,
        userId: authenticated.userId,
      },
      userId: authenticated.userId,
    });

    return jsonResponse({ accepted: true }, 202, requestId);
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

  const workspaceChannelsMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/channels$/,
  );
  if (workspaceChannelsMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const body = parseCreateChannelRequest(await readJsonObject(request));
    const workspaceId = parseUuidPathParameter(
      requirePathPart(workspaceChannelsMatch, 0),
      "workspaceId",
    );
    const channel = await options.channelService.createChannel({
      ...body,
      userId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse({ channel }, 201, requestId);
  }

  const workspaceTreeMatch = matchPath(url.pathname, /^\/api\/v1\/workspaces\/([^/]+)\/tree$/);
  if (workspaceTreeMatch) {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    const workspaceId = parseUuidPathParameter(
      requirePathPart(workspaceTreeMatch, 0),
      "workspaceId",
    );
    const tree = await options.channelService.listVisibleTree(workspaceId, authenticated.userId);

    return jsonResponse({ channels: tree }, 200, requestId);
  }

  const auditLogMatch = matchPath(url.pathname, /^\/api\/v1\/workspaces\/([^/]+)\/audit-log$/);
  if (auditLogMatch) {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    const workspaceId = parseUuidPathParameter(requirePathPart(auditLogMatch, 0), "workspaceId");
    const query = parseListAuditLogQuery(url.searchParams);
    const result = await requireModerationService(options).listAuditLog({
      limit: query.limit,
      userId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse(result, 200, requestId);
  }

  const memberModerationMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/members\/([^/]+)\/(kick|ban|unban|timeout)$/,
  );
  if (memberModerationMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(
      requirePathPart(memberModerationMatch, 0),
      "workspaceId",
    );
    const targetUserId = parseUuidPathParameter(
      requirePathPart(memberModerationMatch, 1),
      "targetUserId",
    );
    const action = requirePathPart(memberModerationMatch, 2);
    const moderationService = requireModerationService(options);

    if (action === "timeout") {
      const body = parseTimeoutMemberRequest(await readJsonObject(request));
      const result = await moderationService.timeoutMember({
        ...body,
        actorId: authenticated.userId,
        targetUserId,
        workspaceId,
      });

      return jsonResponse(result, 200, requestId);
    }

    const body = parseModerationReasonRequest(await readJsonObject(request));
    if (action === "kick") {
      const result = await moderationService.kickMember({
        ...body,
        actorId: authenticated.userId,
        targetUserId,
        workspaceId,
      });

      return jsonResponse(result, 200, requestId);
    }
    if (action === "ban") {
      const result = await moderationService.banMember({
        ...body,
        actorId: authenticated.userId,
        targetUserId,
        workspaceId,
      });

      return jsonResponse(result, 200, requestId);
    }
    if (action === "unban") {
      const result = await moderationService.unbanMember({
        ...body,
        actorId: authenticated.userId,
        targetUserId,
        workspaceId,
      });

      return jsonResponse(result, 200, requestId);
    }
  }

  const reorderChannelsMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/channels\/reorder$/,
  );
  if (reorderChannelsMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const body = parseReorderChannelsRequest(await readJsonObject(request));
    const workspaceId = parseUuidPathParameter(
      requirePathPart(reorderChannelsMatch, 0),
      "workspaceId",
    );
    const channels = await options.channelService.reorderChannels({
      ...body,
      userId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse({ channels }, 200, requestId);
  }

  const permissionOverridesMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/channels\/([^/]+)\/permission-overrides$/,
  );
  if (permissionOverridesMatch) {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    const channelId = parseUuidPathParameter(
      requirePathPart(permissionOverridesMatch, 0),
      "channelId",
    );
    const overrides = await options.channelService.listPermissionOverrides(
      channelId,
      authenticated.userId,
    );

    return jsonResponse({ overrides }, 200, requestId);
  }

  const permissionOverrideMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/channels\/([^/]+)\/permission-overrides\/([^/]+)\/([^/]+)$/,
  );
  if (permissionOverrideMatch) {
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const channelIdValue = requirePathPart(permissionOverrideMatch, 0);
    const targetTypeValue = requirePathPart(permissionOverrideMatch, 1);
    const targetIdValue = requirePathPart(permissionOverrideMatch, 2);
    const channelId = parseUuidPathParameter(channelIdValue, "channelId");
    const targetId = parseUuidPathParameter(targetIdValue, "targetId");
    const targetType = parsePermissionOverrideTargetType(targetTypeValue);

    if (request.method === "PUT") {
      const body = parsePermissionOverrideRequest(await readJsonObject(request));
      const override = await options.channelService.upsertPermissionOverride({
        ...body,
        channelId,
        targetId,
        targetType,
        userId: authenticated.userId,
      });

      return jsonResponse({ override }, 200, requestId);
    }

    if (request.method === "DELETE") {
      await options.channelService.deletePermissionOverride({
        channelId,
        targetId,
        targetType,
        userId: authenticated.userId,
      });

      return jsonResponse({ ok: true }, 200, requestId);
    }

    throw methodNotAllowed();
  }

  const effectivePermissionsMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/channels\/([^/]+)\/effective-permissions\/me$/,
  );
  if (effectivePermissionsMatch) {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    const channelId = parseUuidPathParameter(
      requirePathPart(effectivePermissionsMatch, 0),
      "channelId",
    );
    const effectivePermissions = await options.channelService.getEffectivePermissions(
      channelId,
      authenticated.userId,
    );

    return jsonResponse(effectivePermissions, 200, requestId);
  }

  const channelMessagesMatch = matchPath(url.pathname, /^\/api\/v1\/channels\/([^/]+)\/messages$/);
  if (channelMessagesMatch) {
    const authenticated = await authenticateRequest(request, options);
    const channelId = parseUuidPathParameter(requirePathPart(channelMessagesMatch, 0), "channelId");

    if (request.method === "GET") {
      const query = parseListMessagesQuery(url.searchParams);
      const result = await options.messageService.listMessages({
        ...(query.after
          ? { after: { createdAt: new Date(query.after.createdAt), id: query.after.id } }
          : {}),
        ...(query.before
          ? { before: { createdAt: new Date(query.before.createdAt), id: query.before.id } }
          : {}),
        channelId,
        limit: query.limit,
        userId: authenticated.userId,
      });

      return jsonResponse(result, 200, requestId);
    }

    if (request.method === "POST") {
      assertCsrf(request, authenticated, options);
      const body = parseCreateMessageRequest(await readJsonObject(request));
      const result = await options.messageService.createMessage({
        ...body,
        channelId,
        userId: authenticated.userId,
      });

      return jsonResponse(result, result.duplicate ? 200 : 201, requestId);
    }

    throw methodNotAllowed();
  }

  const messageMatch = matchPath(url.pathname, /^\/api\/v1\/messages\/([^/]+)$/);
  if (messageMatch) {
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const messageId = parseUuidPathParameter(requirePathPart(messageMatch, 0), "messageId");

    if (request.method === "PATCH") {
      const body = parseUpdateMessageRequest(await readJsonObject(request));
      const message = await options.messageService.updateMessage({
        ...body,
        messageId,
        userId: authenticated.userId,
      });

      return jsonResponse({ message }, 200, requestId);
    }

    if (request.method === "DELETE") {
      const message = await options.messageService.deleteMessage({
        messageId,
        userId: authenticated.userId,
      });

      return jsonResponse({ message }, 200, requestId);
    }

    throw methodNotAllowed();
  }

  const voiceJoinMatch = matchPath(url.pathname, /^\/api\/v1\/channels\/([^/]+)\/voice\/join$/);
  if (voiceJoinMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const channelId = parseUuidPathParameter(requirePathPart(voiceJoinMatch, 0), "channelId");
    const body = parseVoiceJoinRequest(await readJsonObject(request));
    const result = await requireVoiceService(options).join({
      ...body,
      channelId,
      sessionId: authenticated.sessionId,
      userId: authenticated.userId,
    });

    return jsonResponse(result, 200, requestId);
  }

  const voiceLeaveMatch = matchPath(url.pathname, /^\/api\/v1\/workspaces\/([^/]+)\/voice\/leave$/);
  if (voiceLeaveMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(requirePathPart(voiceLeaveMatch, 0), "workspaceId");
    const result = await requireVoiceService(options).leave(workspaceId, authenticated.userId);

    return jsonResponse(result, 200, requestId);
  }

  const voiceStateMatch = matchPath(url.pathname, /^\/api\/v1\/workspaces\/([^/]+)\/voice\/state$/);
  if (voiceStateMatch) {
    assertMethod(request, "PATCH");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(requirePathPart(voiceStateMatch, 0), "workspaceId");
    const body = parseVoiceSelfStateRequest(await readJsonObject(request));
    const state = await requireVoiceService(options).updateSelfState({
      ...body,
      userId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse({ state }, 200, requestId);
  }

  const voiceServerMuteMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/voice\/server-mute$/,
  );
  if (voiceServerMuteMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(
      requirePathPart(voiceServerMuteMatch, 0),
      "workspaceId",
    );
    const body = parseVoiceModerationRequest(await readJsonObject(request));
    const state = await requireVoiceService(options).serverMute({
      ...body,
      actorId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse({ state }, 200, requestId);
  }

  const voiceServerDeafenMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/voice\/server-deafen$/,
  );
  if (voiceServerDeafenMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(
      requirePathPart(voiceServerDeafenMatch, 0),
      "workspaceId",
    );
    const body = parseVoiceModerationRequest(await readJsonObject(request));
    const state = await requireVoiceService(options).serverDeafen({
      ...body,
      actorId: authenticated.userId,
      workspaceId,
    });

    return jsonResponse({ state }, 200, requestId);
  }

  const voiceMoveMatch = matchPath(url.pathname, /^\/api\/v1\/workspaces\/([^/]+)\/voice\/move$/);
  if (voiceMoveMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(requirePathPart(voiceMoveMatch, 0), "workspaceId");
    const body = parseVoiceMoveRequest(await readJsonObject(request));
    const state = await requireVoiceService(options).moveMember({
      actorId: authenticated.userId,
      reason: body.reason ?? null,
      targetChannelId: body.channelId,
      targetUserId: body.targetUserId,
      workspaceId,
    });

    return jsonResponse({ state }, 200, requestId);
  }

  const voiceDisconnectMatch = matchPath(
    url.pathname,
    /^\/api\/v1\/workspaces\/([^/]+)\/voice\/disconnect$/,
  );
  if (voiceDisconnectMatch) {
    assertMethod(request, "POST");
    const authenticated = await authenticateRequest(request, options);
    assertCsrf(request, authenticated, options);
    const workspaceId = parseUuidPathParameter(
      requirePathPart(voiceDisconnectMatch, 0),
      "workspaceId",
    );
    const body = parseVoiceMemberModerationRequest(await readJsonObject(request));
    const state = await requireVoiceService(options).disconnectMember({
      actorId: authenticated.userId,
      reason: body.reason ?? null,
      targetUserId: body.targetUserId,
      workspaceId,
    });

    return jsonResponse({ state }, 200, requestId);
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

  assertTrustedCsrfOrigin(request, options.config);

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

function requireVoiceService(options: ApiHandlerOptions): VoiceService {
  if (!options.voiceService) {
    throw new ApiError(500, "INTERNAL_ERROR", "Voice service is not configured.");
  }

  return options.voiceService;
}

function requireModerationService(options: ApiHandlerOptions): ModerationService {
  if (!options.moderationService) {
    throw new ApiError(500, "INTERNAL_ERROR", "Moderation service is not configured.");
  }

  return options.moderationService;
}

function requireObservabilityService(options: ApiHandlerOptions): ObservabilityService {
  if (!options.observabilityService) {
    throw new ApiError(500, "INTERNAL_ERROR", "Observability service is not configured.");
  }

  return options.observabilityService;
}

function logApiError(input: {
  readonly apiError: ApiError;
  readonly method: string;
  readonly path: string;
  readonly requestId: string;
}): void {
  process.stderr.write(
    `${JSON.stringify({
      code: input.apiError.code,
      event: "api_error",
      level: "error",
      method: input.method,
      path: input.path,
      requestId: input.requestId,
      status: input.apiError.status,
    })}\n`,
  );
}

function matchPath(pathname: string, pattern: RegExp): string[] | null {
  const match = pattern.exec(pathname);
  if (!match) {
    return null;
  }

  return match.slice(1).map(decodeURIComponent);
}

function requirePathPart(parts: readonly string[], index: number): string {
  const value = parts[index];
  if (value === undefined) {
    throw notFound();
  }

  return value;
}
