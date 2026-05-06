import { DuplicateEmailError } from "../../db/errors.js";
import type { Session, User } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { conflict, unauthorized } from "../../http/errors.js";
import { normalizeEmail } from "../../http/validation.js";
import type { PasswordHasher } from "../../security/password.js";
import { createSecretToken, createSessionToken, hashToken } from "../../security/session-token.js";

export interface AuthServiceOptions {
  readonly csrfSecret: string;
  readonly now?: () => Date;
  readonly passwordHasher: PasswordHasher;
  readonly repository: OpenVoiceRepository;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
}

export interface AuthSessionResult {
  readonly csrfToken: string;
  readonly expiresAt: Date;
  readonly rawSessionToken: string;
  readonly user: PublicUser;
}

export interface ExternalIdentityInput {
  readonly displayName: string;
  readonly email: string;
  readonly subject: string;
}

export interface PublicUser {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
}

export class AuthService {
  private readonly now: () => Date;
  private readonly csrfSecret: string;
  private readonly passwordHasher: PasswordHasher;
  private readonly repository: OpenVoiceRepository;
  private readonly sessionSecret: string;
  private readonly sessionTtlSeconds: number;

  public constructor(options: AuthServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.csrfSecret = options.csrfSecret;
    this.passwordHasher = options.passwordHasher;
    this.repository = options.repository;
    this.sessionSecret = options.sessionSecret;
    this.sessionTtlSeconds = options.sessionTtlSeconds;
  }

  public async register(input: {
    readonly displayName?: string;
    readonly email: string;
    readonly password: string;
  }): Promise<AuthSessionResult> {
    const emailNormalized = normalizeEmail(input.email);
    const passwordHash = await this.passwordHasher.hashPassword(input.password);

    try {
      const user = await this.repository.createUser({
        displayName: input.displayName ?? emailNormalized,
        email: emailNormalized,
        emailNormalized,
        passwordHash,
      });

      return this.createSessionForUser(user);
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw conflict("Email is already registered.", { field: "email" });
      }

      throw error;
    }
  }

  public async login(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<AuthSessionResult> {
    const user = await this.repository.findUserByEmailNormalized(normalizeEmail(input.email));

    if (!user) {
      throw unauthorized("Invalid email or password.");
    }

    const passwordMatches = await this.passwordHasher.verifyPassword(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches) {
      throw unauthorized("Invalid email or password.");
    }

    return this.createSessionForUser(user);
  }

  public async loginWithExternalIdentity(input: ExternalIdentityInput): Promise<AuthSessionResult> {
    const existingBySubject = await this.repository.findUserByKeycloakSubject(input.subject);
    if (existingBySubject) {
      return this.createSessionForUser(existingBySubject);
    }

    const emailNormalized = normalizeEmail(input.email);
    const existingByEmail = await this.repository.findUserByEmailNormalized(emailNormalized);
    if (existingByEmail) {
      const linked = await this.repository.linkUserToKeycloakSubject(
        existingByEmail.id,
        input.subject,
        this.now(),
      );
      return this.createSessionForUser(linked);
    }

    try {
      const user = await this.repository.createUser({
        displayName: input.displayName || emailNormalized,
        email: emailNormalized,
        emailNormalized,
        keycloakSubject: input.subject,
        linkedAt: this.now(),
        passwordHash: "external:keycloak",
      });

      return this.createSessionForUser(user);
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        const user = await this.repository.findUserByEmailNormalized(emailNormalized);
        if (user) {
          return this.createSessionForUser(
            await this.repository.linkUserToKeycloakSubject(user.id, input.subject, this.now()),
          );
        }
      }

      throw error;
    }
  }

  public async authenticate(
    rawToken: string,
  ): Promise<{ readonly session: Session; readonly user: User } | null> {
    const session = await this.repository.findActiveSessionByTokenHash(
      hashToken(rawToken, this.sessionSecret),
      this.now(),
    );

    if (!session) {
      return null;
    }

    const user = await this.repository.findUserById(session.userId);

    if (!user) {
      return null;
    }

    return { session, user };
  }

  public async logout(rawToken: string): Promise<void> {
    await this.repository.revokeSession(hashToken(rawToken, this.sessionSecret), this.now());
  }

  public verifyCsrfToken(session: Session, csrfToken: string): boolean {
    return hashToken(csrfToken, this.csrfSecret) === session.csrfTokenHash;
  }

  public async createSessionForUser(user: User): Promise<AuthSessionResult> {
    const sessionToken = createSessionToken(this.sessionSecret);
    const csrfToken = createSecretToken();
    const expiresAt = new Date(this.now().getTime() + this.sessionTtlSeconds * 1000);

    await this.repository.createSession({
      csrfTokenHash: hashToken(csrfToken, this.csrfSecret),
      expiresAt,
      tokenHash: sessionToken.tokenHash,
      userId: user.id,
    });

    return {
      csrfToken,
      expiresAt,
      rawSessionToken: sessionToken.rawToken,
      user: toPublicUser(user),
    };
  }
}

export function toPublicUser(user: User): PublicUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
  };
}
