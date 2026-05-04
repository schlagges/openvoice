export interface SessionCookieOptions {
  readonly maxAgeSeconds: number;
  readonly name: string;
  readonly secure: boolean;
}

export function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();

  if (!header) {
    return cookies;
  }

  for (const segment of header.split(";")) {
    const [rawName, ...rawValue] = segment.trim().split("=");
    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

export function createSessionCookie(value: string, options: SessionCookieOptions): string {
  return [
    `${options.name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearSessionCookie(options: Pick<SessionCookieOptions, "name" | "secure">): string {
  return [
    `${options.name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}
