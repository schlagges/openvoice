import { parseCookieHeader } from "../http/cookies.js";

export type AuthTransport = "bearer" | "cookie";

export interface RequestToken {
  readonly token: string;
  readonly transport: AuthTransport;
}

export function readRequestToken(request: Request, cookieName: string): RequestToken | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? { token, transport: "bearer" } : null;
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieToken = cookies.get(cookieName);

  if (!cookieToken) {
    return null;
  }

  return {
    token: cookieToken,
    transport: "cookie",
  };
}
