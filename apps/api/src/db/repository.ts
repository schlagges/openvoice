import type {
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  CreateWorkspaceResult,
  Session,
  User,
} from "./models.js";

export interface OpenVoiceRepository {
  createSession(input: CreateSessionInput): Promise<Session>;
  createUser(input: CreateUserInput): Promise<User>;
  createWorkspaceWithDefaults(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult>;
  findActiveSessionByTokenHash(tokenHash: string, now: Date): Promise<Session | null>;
  findUserByEmailNormalized(emailNormalized: string): Promise<User | null>;
  findUserById(userId: string): Promise<User | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
}
