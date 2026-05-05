import type { PresenceStatus } from "@openvoice/shared";

import { RedisCommandConnection } from "./pubsub.js";

export interface PresenceConnectionInput {
  readonly connectionId: string;
  readonly status: PresenceStatus;
  readonly ttlMs: number;
  readonly userId: string;
  readonly workspaceIds: readonly string[];
}

export interface PresenceConnectionResult {
  readonly onlineWorkspaceIds: readonly string[];
}

export interface PresenceRemovalInput {
  readonly connectionId: string;
  readonly userId: string;
  readonly workspaceIds: readonly string[];
}

export interface PresenceRemovalResult {
  readonly offlineWorkspaceIds: readonly string[];
}

export interface PresenceStore {
  addConnection(input: PresenceConnectionInput): Promise<PresenceConnectionResult>;
  refreshConnection(input: PresenceConnectionInput): Promise<void>;
  removeConnection(input: PresenceRemovalInput): Promise<PresenceRemovalResult>;
  updateConnectionStatus(input: PresenceConnectionInput): Promise<void>;
}

export class InMemoryPresenceStore implements PresenceStore {
  private readonly connections = new Map<string, PresenceConnectionInput>();
  private readonly workspaceConnections = new Map<string, Map<string, Set<string>>>();

  public async addConnection(input: PresenceConnectionInput): Promise<PresenceConnectionResult> {
    const onlineWorkspaceIds: string[] = [];
    this.connections.set(input.connectionId, input);

    for (const workspaceId of input.workspaceIds) {
      const users = this.workspaceConnections.get(workspaceId) ?? new Map<string, Set<string>>();
      const connections = users.get(input.userId) ?? new Set<string>();
      if (connections.size === 0) {
        onlineWorkspaceIds.push(workspaceId);
      }
      connections.add(input.connectionId);
      users.set(input.userId, connections);
      this.workspaceConnections.set(workspaceId, users);
    }

    return { onlineWorkspaceIds };
  }

  public async refreshConnection(input: PresenceConnectionInput): Promise<void> {
    this.connections.set(input.connectionId, input);
  }

  public async removeConnection(input: PresenceRemovalInput): Promise<PresenceRemovalResult> {
    this.connections.delete(input.connectionId);
    const offlineWorkspaceIds: string[] = [];

    for (const workspaceId of input.workspaceIds) {
      const users = this.workspaceConnections.get(workspaceId);
      const connections = users?.get(input.userId);
      if (!users || !connections) {
        continue;
      }

      connections.delete(input.connectionId);
      if (connections.size === 0) {
        users.delete(input.userId);
        offlineWorkspaceIds.push(workspaceId);
      }
    }

    return { offlineWorkspaceIds };
  }

  public async updateConnectionStatus(input: PresenceConnectionInput): Promise<void> {
    this.connections.set(input.connectionId, input);
  }
}

export class RedisPresenceStore implements PresenceStore {
  private readonly redis: RedisCommandConnection;

  public constructor(redisUrl: string) {
    this.redis = new RedisCommandConnection(redisUrl);
  }

  public async addConnection(input: PresenceConnectionInput): Promise<PresenceConnectionResult> {
    const onlineWorkspaceIds: string[] = [];
    await this.writeConnection(input);

    for (const workspaceId of input.workspaceIds) {
      const key = workspaceUserKey(workspaceId, input.userId);
      const countBefore = await this.redis.command(["SCARD", key]);
      await this.redis.command(["SADD", key, input.connectionId]);
      await this.redis.command(["PEXPIRE", key, input.ttlMs.toString()]);
      if (countBefore === 0) {
        onlineWorkspaceIds.push(workspaceId);
      }
    }

    return { onlineWorkspaceIds };
  }

  public async refreshConnection(input: PresenceConnectionInput): Promise<void> {
    await this.writeConnection(input);
    for (const workspaceId of input.workspaceIds) {
      await this.redis.command([
        "PEXPIRE",
        workspaceUserKey(workspaceId, input.userId),
        input.ttlMs.toString(),
      ]);
    }
  }

  public async removeConnection(input: PresenceRemovalInput): Promise<PresenceRemovalResult> {
    await this.redis.command(["DEL", connectionKey(input.connectionId)]);
    const offlineWorkspaceIds: string[] = [];

    for (const workspaceId of input.workspaceIds) {
      const key = workspaceUserKey(workspaceId, input.userId);
      await this.redis.command(["SREM", key, input.connectionId]);
      const countAfter = await this.redis.command(["SCARD", key]);
      if (countAfter === 0) {
        offlineWorkspaceIds.push(workspaceId);
      }
    }

    return { offlineWorkspaceIds };
  }

  public async updateConnectionStatus(input: PresenceConnectionInput): Promise<void> {
    await this.writeConnection(input);
  }

  private async writeConnection(input: PresenceConnectionInput): Promise<void> {
    await this.redis.command([
      "SET",
      connectionKey(input.connectionId),
      JSON.stringify({
        status: input.status,
        userId: input.userId,
        workspaceIds: input.workspaceIds,
      }),
      "PX",
      input.ttlMs.toString(),
    ]);
  }
}

function connectionKey(connectionId: string): string {
  return `openvoice:presence:connection:${connectionId}`;
}

function workspaceUserKey(workspaceId: string, userId: string): string {
  return `openvoice:presence:workspace:${workspaceId}:user:${userId}`;
}
