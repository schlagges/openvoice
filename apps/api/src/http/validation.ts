import {
  isChannelType,
  isAudioMode,
  isMessageContentFormat,
  isVideoContentMode,
  isVideoQualityProfile,
  AudioMode,
  isIceCandidateType,
  MessageContentFormat,
  isRtcTransportProtocol,
  VideoContentMode,
  VideoQualityProfile,
  parseMessageCursor,
  parsePermissionMask,
  type ChannelType,
  type MessageContentFormat as ContentFormat,
  type MessageCursor,
  type PermissionMask,
  type ClientRtcQualitySample,
} from "@openvoice/shared";

import type { PermissionOverrideTargetType } from "../db/models.js";
import { badRequest } from "./errors.js";

export interface RegisterRequestBody {
  readonly displayName?: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginRequestBody {
  readonly email: string;
  readonly password: string;
}

export interface CreateWorkspaceRequestBody {
  readonly name: string;
}

export interface JoinWorkspaceInviteRequestBody {
  readonly code: string;
}

export interface CreateKeycloakWorkspaceInviteRequestBody {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly username: string;
}

export interface CreateChannelRequestBody {
  readonly name: string;
  readonly parentId?: string | null;
  readonly position?: number;
  readonly type: ChannelType;
}

export interface ReorderChannelsRequestBody {
  readonly moves: readonly ReorderChannelRequestMove[];
}

export interface ReorderChannelRequestMove {
  readonly channelId: string;
  readonly parentId: string | null;
  readonly position: number;
}

export interface PermissionOverrideRequestBody {
  readonly allow: PermissionMask;
  readonly deny: PermissionMask;
}

export interface CreateMessageRequestBody {
  readonly clientMessageId: string;
  readonly content: string;
  readonly contentFormat: ContentFormat;
}

export interface UpdateMessageRequestBody {
  readonly content: string;
  readonly contentFormat: ContentFormat;
}

export interface VoiceJoinRequestBody {
  readonly audioMode: AudioMode;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
}

export interface VoiceSelfStateRequestBody {
  readonly audioMode?: AudioMode;
  readonly cameraEnabled?: boolean;
  readonly cameraQuality?: VideoQualityProfile;
  readonly screenShareContentMode?: VideoContentMode;
  readonly screenShareEnabled?: boolean;
  readonly screenShareQuality?: VideoQualityProfile;
  readonly selfDeafened?: boolean;
  readonly selfMuted?: boolean;
  readonly speaking?: boolean;
}

export interface VoiceModerationRequestBody {
  readonly enabled: boolean;
  readonly reason?: string | null;
  readonly targetUserId: string;
}

export interface ListMessagesRequestQuery {
  readonly after?: MessageCursor;
  readonly before?: MessageCursor;
  readonly limit: number;
}

export interface ModerationReasonRequestBody {
  readonly reason?: string | null;
}

export interface TimeoutMemberRequestBody extends ModerationReasonRequestBody {
  readonly durationSeconds: number;
}

export interface VoiceMoveRequestBody extends ModerationReasonRequestBody {
  readonly channelId: string;
  readonly targetUserId: string;
}

export interface VoiceMemberModerationRequestBody extends ModerationReasonRequestBody {
  readonly targetUserId: string;
}

export interface ListAuditLogRequestQuery {
  readonly limit: number;
}

export type RtcStatsRequestBody = Omit<ClientRtcQualitySample, "userId">;

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw badRequest("Expected application/json request body.");
  }

  const parsed: unknown = await request.json().catch(() => {
    throw badRequest("Invalid JSON request body.");
  });

  if (!isPlainObject(parsed)) {
    throw badRequest("Expected JSON object request body.");
  }

  return parsed;
}

export function parseRegisterRequest(body: Record<string, unknown>): RegisterRequestBody {
  const email = parseEmail(body.email);
  const password = parsePassword(body.password);
  const displayName =
    body.displayName === undefined ? undefined : parseDisplayName(body.displayName, "displayName");

  return {
    ...(displayName ? { displayName } : {}),
    email,
    password,
  };
}

export function parseLoginRequest(body: Record<string, unknown>): LoginRequestBody {
  return {
    email: parseEmail(body.email),
    password: parseNonEmptyString(body.password, "password"),
  };
}

export function parseCreateWorkspaceRequest(
  body: Record<string, unknown>,
): CreateWorkspaceRequestBody {
  return {
    name: parseDisplayName(body.name, "name"),
  };
}

export function parseJoinWorkspaceInviteRequest(
  body: Record<string, unknown>,
): JoinWorkspaceInviteRequestBody {
  const code = parseNonEmptyString(body.code, "code").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) {
    throw badRequest("Invite code is invalid.", { field: "code" });
  }

  return { code };
}

export function parseCreateKeycloakWorkspaceInviteRequest(
  body: Record<string, unknown>,
): CreateKeycloakWorkspaceInviteRequestBody {
  return {
    displayName: parseDisplayName(body.displayName, "displayName"),
    email: parseEmail(body.email),
    id: parseNonEmptyString(body.id, "id").trim(),
    username: parseNonEmptyString(body.username, "username").trim(),
  };
}

export function parseKeycloakUserSearchQuery(searchParams: URLSearchParams): string {
  const query = searchParams.get("q") ?? "";
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw badRequest("q must contain at least 2 characters.", { field: "q" });
  }
  if (trimmed.length > 80) {
    throw badRequest("q must be at most 80 characters.", { field: "q" });
  }

  return trimmed;
}

export function parseGuestJoinWorkspaceInviteRequest(body: Record<string, unknown>): {
  readonly displayName: string;
} {
  return {
    displayName: parseDisplayName(body.displayName, "displayName"),
  };
}

export function parseCreateChannelRequest(body: Record<string, unknown>): CreateChannelRequestBody {
  const parentId =
    body.parentId === undefined || body.parentId === null
      ? null
      : parseUuidLikeString(body.parentId, "parentId");
  const position =
    body.position === undefined ? undefined : parseNonNegativeInteger(body.position, "position");

  return {
    name: parseDisplayName(body.name, "name"),
    ...(parentId !== null ? { parentId } : {}),
    ...(position !== undefined ? { position } : {}),
    type: parseChannelType(body.type),
  };
}

export function parseReorderChannelsRequest(
  body: Record<string, unknown>,
): ReorderChannelsRequestBody {
  if (!Array.isArray(body.moves)) {
    throw badRequest("moves is required.", {
      field: "moves",
    });
  }

  return {
    moves: body.moves.map((move, index) => {
      if (!isPlainObject(move)) {
        throw badRequest("Each move must be an object.", {
          index,
        });
      }

      return {
        channelId: parseUuidLikeString(move.channelId, "channelId"),
        parentId: move.parentId === null ? null : parseUuidLikeString(move.parentId, "parentId"),
        position: parseNonNegativeInteger(move.position, "position"),
      };
    }),
  };
}

export function parsePermissionOverrideRequest(
  body: Record<string, unknown>,
): PermissionOverrideRequestBody {
  return {
    allow: parsePermissionMaskString(body.allow, "allow"),
    deny: parsePermissionMaskString(body.deny, "deny"),
  };
}

export function parsePermissionOverrideTargetType(value: string): PermissionOverrideTargetType {
  if (value === "role" || value === "member") {
    return value;
  }

  throw badRequest("Invalid permission override target type.", {
    field: "targetType",
  });
}

export function parseCreateMessageRequest(body: Record<string, unknown>): CreateMessageRequestBody {
  return {
    clientMessageId: parseClientMessageId(body.clientMessageId),
    content: parseMessageContent(body.content),
    contentFormat: parseMessageContentFormat(body.contentFormat),
  };
}

export function parseUpdateMessageRequest(body: Record<string, unknown>): UpdateMessageRequestBody {
  return {
    content: parseMessageContent(body.content),
    contentFormat: parseMessageContentFormat(body.contentFormat),
  };
}

export function parseVoiceJoinRequest(body: Record<string, unknown>): VoiceJoinRequestBody {
  const selfDeafened =
    body.selfDeafened === undefined ? false : parseBoolean(body.selfDeafened, "selfDeafened");

  return {
    audioMode:
      body.audioMode === undefined ? AudioMode.VOICE : parseAudioMode(body.audioMode, "audioMode"),
    selfDeafened,
    selfMuted: selfDeafened
      ? true
      : body.selfMuted === undefined
        ? false
        : parseBoolean(body.selfMuted, "selfMuted"),
  };
}

export function parseVoiceSelfStateRequest(
  body: Record<string, unknown>,
): VoiceSelfStateRequestBody {
  return {
    ...(body.audioMode !== undefined
      ? { audioMode: parseAudioMode(body.audioMode, "audioMode") }
      : {}),
    ...(body.cameraEnabled !== undefined
      ? { cameraEnabled: parseBoolean(body.cameraEnabled, "cameraEnabled") }
      : {}),
    ...(body.cameraQuality !== undefined
      ? { cameraQuality: parseVideoQualityProfile(body.cameraQuality, "cameraQuality") }
      : {}),
    ...(body.screenShareContentMode !== undefined
      ? {
          screenShareContentMode: parseVideoContentMode(
            body.screenShareContentMode,
            "screenShareContentMode",
          ),
        }
      : {}),
    ...(body.screenShareEnabled !== undefined
      ? { screenShareEnabled: parseBoolean(body.screenShareEnabled, "screenShareEnabled") }
      : {}),
    ...(body.screenShareQuality !== undefined
      ? {
          screenShareQuality: parseVideoQualityProfile(
            body.screenShareQuality,
            "screenShareQuality",
          ),
        }
      : {}),
    ...(body.selfDeafened !== undefined
      ? { selfDeafened: parseBoolean(body.selfDeafened, "selfDeafened") }
      : {}),
    ...(body.selfMuted !== undefined
      ? { selfMuted: parseBoolean(body.selfMuted, "selfMuted") }
      : {}),
    ...(body.speaking !== undefined ? { speaking: parseBoolean(body.speaking, "speaking") } : {}),
  };
}

export function parseVoiceModerationRequest(
  body: Record<string, unknown>,
): VoiceModerationRequestBody {
  return {
    enabled: parseBoolean(body.enabled, "enabled"),
    ...(body.reason !== undefined ? { reason: parseOptionalReason(body.reason, "reason") } : {}),
    targetUserId: parseUuidLikeString(body.targetUserId, "targetUserId"),
  };
}

export function parseModerationReasonRequest(
  body: Record<string, unknown>,
): ModerationReasonRequestBody {
  return {
    ...(body.reason !== undefined ? { reason: parseOptionalReason(body.reason, "reason") } : {}),
  };
}

export function parseTimeoutMemberRequest(body: Record<string, unknown>): TimeoutMemberRequestBody {
  return {
    durationSeconds: parseBoundedInteger(
      body.durationSeconds,
      "durationSeconds",
      60,
      28 * 24 * 60 * 60,
    ),
    ...(body.reason !== undefined ? { reason: parseOptionalReason(body.reason, "reason") } : {}),
  };
}

export function parseVoiceMoveRequest(body: Record<string, unknown>): VoiceMoveRequestBody {
  return {
    channelId: parseUuidLikeString(body.channelId, "channelId"),
    ...(body.reason !== undefined ? { reason: parseOptionalReason(body.reason, "reason") } : {}),
    targetUserId: parseUuidLikeString(body.targetUserId, "targetUserId"),
  };
}

export function parseVoiceMemberModerationRequest(
  body: Record<string, unknown>,
): VoiceMemberModerationRequestBody {
  return {
    ...(body.reason !== undefined ? { reason: parseOptionalReason(body.reason, "reason") } : {}),
    targetUserId: parseUuidLikeString(body.targetUserId, "targetUserId"),
  };
}

export function parseListMessagesQuery(params: URLSearchParams): ListMessagesRequestQuery {
  const before = params.get("before");
  const after = params.get("after");
  if (before && after) {
    throw badRequest("before and after cursors cannot be combined.");
  }

  return {
    ...(after ? { after: parseCursor(after, "after") } : {}),
    ...(before ? { before: parseCursor(before, "before") } : {}),
    limit: parseLimit(params.get("limit")),
  };
}

export function parseListAuditLogQuery(params: URLSearchParams): ListAuditLogRequestQuery {
  return {
    limit: parseLimit(params.get("limit")),
  };
}

export function parseRtcStatsRequest(body: Record<string, unknown>): RtcStatsRequestBody {
  const audio = parsePlainObject(body.audio, "audio");
  const video = parsePlainObject(body.video, "video");
  const connection = parsePlainObject(body.connection, "connection");
  const selectedCandidateType = connection.selectedCandidateType;
  const transport = connection.transport;

  if (!isIceCandidateType(selectedCandidateType)) {
    throw badRequest("selectedCandidateType is invalid.", {
      field: "connection.selectedCandidateType",
    });
  }
  if (!isRtcTransportProtocol(transport)) {
    throw badRequest("transport is invalid.", {
      field: "connection.transport",
    });
  }

  return {
    audio: {
      bitrateBps: parseNullableNonNegativeNumber(audio.bitrateBps, "audio.bitrateBps"),
      concealedSamples: parseNullableNonNegativeNumber(
        audio.concealedSamples,
        "audio.concealedSamples",
      ),
      jitterMs: parseNullableNonNegativeNumber(audio.jitterMs, "audio.jitterMs"),
      packetsLost: parseNonNegativeNumber(audio.packetsLost, "audio.packetsLost"),
      packetsReceived: parseNonNegativeNumber(audio.packetsReceived, "audio.packetsReceived"),
      rttMs: parseNullableNonNegativeNumber(audio.rttMs, "audio.rttMs"),
    },
    channelId: parseUuidLikeString(body.channelId, "channelId"),
    connection: {
      iceState: parseBoundedText(connection.iceState, "connection.iceState", 64),
      rttMs:
        connection.rttMs === undefined
          ? null
          : parseNullableNonNegativeNumber(connection.rttMs, "connection.rttMs"),
      selectedCandidateType,
      transport,
    },
    sessionId: parseUuidLikeString(body.sessionId, "sessionId"),
    timestamp: parseIsoTimestamp(body.timestamp, "timestamp"),
    video: {
      bitrateBps: parseNullableNonNegativeNumber(video.bitrateBps, "video.bitrateBps"),
      framesDropped: parseNullableNonNegativeNumber(video.framesDropped, "video.framesDropped"),
      framesPerSecond: parseNullableNonNegativeNumber(
        video.framesPerSecond,
        "video.framesPerSecond",
      ),
      height: parseNullableNonNegativeNumber(video.height, "video.height"),
      packetsLost: parseNonNegativeNumber(video.packetsLost, "video.packetsLost"),
      width: parseNullableNonNegativeNumber(video.width, "video.width"),
    },
    workspaceId: parseUuidLikeString(body.workspaceId, "workspaceId"),
  };
}

export function parseUuidPathParameter(value: string, field: string): string {
  return parseUuidLikeString(value, field);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmail(value: unknown): string {
  const email = parseNonEmptyString(value, "email");
  const normalized = normalizeEmail(email);

  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw badRequest("Invalid email address.", { field: "email" });
  }

  return normalized;
}

function parsePassword(value: unknown): string {
  const password = parseNonEmptyString(value, "password");

  if (password.length < 12 || password.length > 1024) {
    throw badRequest("Password must be between 12 and 1024 characters.", { field: "password" });
  }

  return password;
}

function parseDisplayName(value: unknown, field: string): string {
  const text = parseNonEmptyString(value, field).trim();

  if (text.length > 80) {
    throw badRequest(`${field} must be at most 80 characters.`, { field });
  }

  return text;
}

function parseChannelType(value: unknown): ChannelType {
  if (!isChannelType(value)) {
    throw badRequest("Invalid channel type.", {
      field: "type",
    });
  }

  return value;
}

function parseMessageContent(value: unknown): string {
  const content = parseNonEmptyString(value, "content");

  if (content.length > 4000) {
    throw badRequest("content must be at most 4000 characters.", {
      field: "content",
    });
  }

  return content;
}

function parseMessageContentFormat(value: unknown): ContentFormat {
  if (value === undefined) {
    return MessageContentFormat.MARKDOWN;
  }

  if (!isMessageContentFormat(value)) {
    throw badRequest("Invalid message content format.", {
      field: "contentFormat",
    });
  }

  return value;
}

function parseAudioMode(value: unknown, field: string): AudioMode {
  if (!isAudioMode(value)) {
    throw badRequest("Invalid audio mode.", { field });
  }

  return value;
}

function parseVideoContentMode(value: unknown, field: string): VideoContentMode {
  if (!isVideoContentMode(value)) {
    throw badRequest("Invalid video content mode.", { field });
  }

  return value;
}

function parseVideoQualityProfile(value: unknown, field: string): VideoQualityProfile {
  if (!isVideoQualityProfile(value)) {
    throw badRequest("Invalid video quality profile.", { field });
  }

  return value;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw badRequest(`${field} must be a boolean.`, { field });
  }

  return value;
}

function parsePlainObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw badRequest(`${field} must be an object.`, { field });
  }

  return value;
}

function parseBoundedText(value: unknown, field: string, maxLength: number): string {
  const text = parseNonEmptyString(value, field).trim();
  if (text.length > maxLength) {
    throw badRequest(`${field} must be at most ${maxLength} characters.`, { field });
  }

  return text;
}

function parseIsoTimestamp(value: unknown, field: string): string {
  const timestamp = parseNonEmptyString(value, field).trim();
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`${field} must be an ISO timestamp.`, { field });
  }

  return parsed.toISOString();
}

function parseOptionalReason(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`, { field });
  }

  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > 512) {
    throw badRequest(`${field} must be at most 512 characters.`, { field });
  }

  return text;
}

function parseClientMessageId(value: unknown): string {
  const clientMessageId = parseNonEmptyString(value, "clientMessageId").trim();

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientMessageId)) {
    throw badRequest("clientMessageId must be 1-128 URL-safe characters.", {
      field: "clientMessageId",
    });
  }

  return clientMessageId;
}

function parseCursor(value: string, field: string): MessageCursor {
  const cursor = parseMessageCursor(value);
  if (!cursor) {
    throw badRequest(`${field} cursor is invalid.`, {
      field,
    });
  }

  return cursor;
}

function parseLimit(value: string | null): number {
  if (value === null) {
    return 50;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw badRequest("limit must be between 1 and 100.", {
      field: "limit",
    });
  }

  return parsed;
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw badRequest(`${field} must be a non-negative integer.`, {
      field,
    });
  }

  return value;
}

function parseNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw badRequest(`${field} must be a non-negative number.`, {
      field,
    });
  }

  return value;
}

function parseNullableNonNegativeNumber(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }

  return parseNonNegativeNumber(value, field);
}

function parseBoundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} must be an integer between ${min} and ${max}.`, {
      field,
    });
  }

  return value;
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${field} is required.`, { field });
  }

  return value;
}

function parsePermissionMaskString(value: unknown, field: string): PermissionMask {
  const text = parseNonEmptyString(value, field).trim();

  try {
    return parsePermissionMask(text);
  } catch {
    throw badRequest(`${field} must be a non-negative decimal permission mask.`, {
      field,
    });
  }
}

function parseUuidLikeString(value: unknown, field: string): string {
  const text = parseNonEmptyString(value, field).trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw badRequest(`${field} must be a UUID.`, {
      field,
    });
  }

  return text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
