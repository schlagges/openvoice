import {
  isChannelType,
  parsePermissionMask,
  type ChannelType,
  type PermissionMask,
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

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw badRequest(`${field} must be a non-negative integer.`, {
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
