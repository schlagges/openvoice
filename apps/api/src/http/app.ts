import { type ApiConfig } from "../config/env.js";
import type { Session } from "../db/models.js";
import { AuthService, toPublicUser } from "../modules/auth/service.js";
import { ChannelService } from "../modules/channels/service.js";
import { MessageService } from "../modules/messages/service.js";
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
import {
  parseCreateChannelRequest,
  parseCreateMessageRequest,
  parseCreateWorkspaceRequest,
  parseListMessagesQuery,
  parseLoginRequest,
  parsePermissionOverrideRequest,
  parsePermissionOverrideTargetType,
  parseRegisterRequest,
  parseReorderChannelsRequest,
  parseUpdateMessageRequest,
  parseUuidPathParameter,
  parseVoiceJoinRequest,
  parseVoiceModerationRequest,
  parseVoiceSelfStateRequest,
  readJsonObject,
} from "./validation.js";

export interface ApiHandlerOptions {
  readonly authService: AuthService;
  readonly channelService: ChannelService;
  readonly config: Pick<
    ApiConfig,
    "sessionCookieName" | "sessionCookieSecure" | "sessionTtlSeconds"
  >;
  readonly messageService: MessageService;
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

  if (url.pathname === "/api/v1/turn/credentials") {
    assertMethod(request, "GET");
    const authenticated = await authenticateRequest(request, options);
    return jsonResponse(
      requireVoiceService(options).createIceServers(authenticated.userId),
      200,
      requestId,
    );
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

function requireVoiceService(options: ApiHandlerOptions): VoiceService {
  if (!options.voiceService) {
    throw new ApiError(500, "INTERNAL_ERROR", "Voice service is not configured.");
  }

  return options.voiceService;
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
