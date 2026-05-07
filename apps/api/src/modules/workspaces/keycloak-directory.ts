import { forbidden } from "../../http/errors.js";

export interface KeycloakDirectoryUser {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly username: string;
}

export interface KeycloakDirectory {
  searchUsers(query: string): Promise<readonly KeycloakDirectoryUser[]>;
}

export interface KeycloakAdminDirectoryOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly enabled: boolean;
  readonly realm: string;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

interface KeycloakUserResponse {
  readonly email?: string;
  readonly enabled?: boolean;
  readonly firstName?: string;
  readonly id?: string;
  readonly lastName?: string;
  readonly username?: string;
}

export class KeycloakAdminDirectory implements KeycloakDirectory {
  private readonly options: KeycloakAdminDirectoryOptions;
  private cachedToken: { readonly expiresAt: number; readonly token: string } | null = null;

  public constructor(options: KeycloakAdminDirectoryOptions) {
    this.options = options;
  }

  public async searchUsers(query: string): Promise<readonly KeycloakDirectoryUser[]> {
    this.assertEnabled();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    const token = await this.getAccessToken();
    const url = new URL(
      `${this.options.baseUrl.replace(/\/$/, "")}/admin/realms/${encodeURIComponent(
        this.options.realm,
      )}/users`,
    );
    url.searchParams.set("briefRepresentation", "true");
    url.searchParams.set("max", "8");
    url.searchParams.set("search", trimmed);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw forbidden("Keycloak user search failed.");
    }

    const users = (await response.json()) as readonly KeycloakUserResponse[];
    return users
      .filter((user) => user.enabled !== false && user.id && user.username && user.email)
      .map((user) => ({
        displayName: displayNameFromKeycloakUser(user),
        email: user.email ?? "",
        id: user.id ?? "",
        username: user.username ?? "",
      }));
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 10_000) {
      return this.cachedToken.token;
    }

    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, "")}/realms/${encodeURIComponent(
        this.options.realm,
      )}/protocol/openid-connect/token`,
      {
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          grant_type: "client_credentials",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );
    if (!response.ok) {
      throw forbidden("Keycloak admin token request failed.");
    }

    const body = (await response.json()) as TokenResponse;
    if (!body.access_token) {
      throw forbidden("Keycloak admin token response is invalid.");
    }

    this.cachedToken = {
      expiresAt: Date.now() + (body.expires_in ?? 60) * 1000,
      token: body.access_token,
    };
    return body.access_token;
  }

  private assertEnabled(): void {
    if (
      !this.options.enabled ||
      !this.options.baseUrl ||
      !this.options.realm ||
      !this.options.clientId ||
      !this.options.clientSecret
    ) {
      throw forbidden("Keycloak directory search is not configured.");
    }
  }
}

function displayNameFromKeycloakUser(user: KeycloakUserResponse): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.username || user.email || "Keycloak User";
}
