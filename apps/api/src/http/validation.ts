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

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${field} is required.`, { field });
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
