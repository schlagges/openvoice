import {
  Permission,
  ServerGatewayEventType,
  type PublicAuditLogEntry,
  type VoiceStateUpdatePayload,
  type WorkspaceBan,
  type WorkspaceTimeout,
} from "@openvoice/shared";

import type {
  AuditLogEntry,
  VoiceStateRecord,
  WorkspaceBanRecord,
  WorkspaceTimeoutRecord,
} from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { badRequest, forbidden, notFound } from "../../http/errors.js";
import type { ChannelService } from "../channels/service.js";
import type { GatewayEventPublisher } from "../gateway/events.js";
import type { MediaProvider } from "../media/provider.js";
import { createLiveKitRoomName, toPublicVoiceState } from "../voice/service.js";
import { assertCanModerateMember, requireWorkspacePermission } from "./hierarchy.js";

export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export interface ModerationServiceOptions {
  readonly channelService: ChannelService;
  readonly eventPublisher?: GatewayEventPublisher;
  readonly mediaProvider?: MediaProvider;
  readonly repository: OpenVoiceRepository;
}

export interface MemberModerationCommand {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface TimeoutMemberCommand extends MemberModerationCommand {
  readonly durationSeconds: number;
}

export interface ListAuditLogCommand {
  readonly limit: number;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface KickMemberResponse {
  readonly ok: true;
  readonly targetUserId: string;
}

export interface BanMemberResponse {
  readonly ban: WorkspaceBan;
}

export interface TimeoutMemberResponse {
  readonly timeout: WorkspaceTimeout;
}

export interface AuditLogResponse {
  readonly entries: readonly PublicAuditLogEntry[];
}

export class ModerationService {
  private readonly channelService: ChannelService;
  private readonly eventPublisher: GatewayEventPublisher | null;
  private readonly mediaProvider: MediaProvider | null;
  private readonly repository: OpenVoiceRepository;

  public constructor(options: ModerationServiceOptions) {
    this.channelService = options.channelService;
    this.eventPublisher = options.eventPublisher ?? null;
    this.mediaProvider = options.mediaProvider ?? null;
    this.repository = options.repository;
  }

  public async kickMember(command: MemberModerationCommand): Promise<KickMemberResponse> {
    const actorAccess = await requireWorkspacePermission(
      this.repository,
      command.workspaceId,
      command.actorId,
      Permission.KICK_MEMBERS,
    );
    await assertCanModerateMember({
      actorAccess,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });

    const result = await this.repository.kickWorkspaceMember(command);
    if (!result) {
      throw notFound("Workspace member not found.");
    }

    await this.disconnectVoiceState(result.voiceState);
    return {
      ok: true,
      targetUserId: command.targetUserId,
    };
  }

  public async banMember(command: MemberModerationCommand): Promise<BanMemberResponse> {
    const actorAccess = await requireWorkspacePermission(
      this.repository,
      command.workspaceId,
      command.actorId,
      Permission.BAN_MEMBERS,
    );
    await assertCanModerateMember({
      actorAccess,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });

    const result = await this.repository.banWorkspaceMember(command);
    await this.disconnectVoiceState(result.voiceState);
    return {
      ban: toPublicWorkspaceBan(result.ban),
    };
  }

  public async unbanMember(command: MemberModerationCommand): Promise<BanMemberResponse> {
    const actorAccess = await requireWorkspacePermission(
      this.repository,
      command.workspaceId,
      command.actorId,
      Permission.BAN_MEMBERS,
    );

    if (actorAccess.workspace.ownerId === command.targetUserId) {
      throw forbidden("The workspace owner is protected from moderation actions.");
    }

    const ban = await this.repository.unbanWorkspaceMember(command);
    if (!ban) {
      throw notFound("Active ban not found.");
    }

    return {
      ban: toPublicWorkspaceBan(ban),
    };
  }

  public async timeoutMember(command: TimeoutMemberCommand): Promise<TimeoutMemberResponse> {
    assertTimeoutDuration(command.durationSeconds);
    const actorAccess = await requireWorkspacePermission(
      this.repository,
      command.workspaceId,
      command.actorId,
      Permission.TIMEOUT_MEMBERS,
    );
    await assertCanModerateMember({
      actorAccess,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });

    const timeout = await this.repository.timeoutWorkspaceMember({
      actorId: command.actorId,
      reason: command.reason ?? null,
      targetUserId: command.targetUserId,
      timedOutUntil: new Date(Date.now() + command.durationSeconds * 1000),
      workspaceId: command.workspaceId,
    });
    const voiceState = await this.repository.findVoiceState(
      command.workspaceId,
      command.targetUserId,
    );
    if (voiceState) {
      await this.enforceTimedOutVoiceState(voiceState);
      await this.publishVoiceState(voiceState);
    }

    return {
      timeout: toPublicWorkspaceTimeout(timeout),
    };
  }

  public async listAuditLog(command: ListAuditLogCommand): Promise<AuditLogResponse> {
    await requireWorkspacePermission(
      this.repository,
      command.workspaceId,
      command.userId,
      Permission.VIEW_AUDIT_LOG,
    );
    const entries = await this.repository.listAuditLog({
      limit: command.limit,
      workspaceId: command.workspaceId,
    });

    return {
      entries: entries.map(toPublicAuditLogEntry),
    };
  }

  private async disconnectVoiceState(state: VoiceStateRecord | null): Promise<void> {
    if (!state) {
      return;
    }

    await this.mediaProvider?.disconnectVoiceParticipant({
      roomName: createLiveKitRoomName(state.workspaceId, state.channelId),
      userId: state.userId,
    });
    await this.publishVoiceState(null, state.workspaceId, state.channelId);
  }

  private async enforceTimedOutVoiceState(state: VoiceStateRecord): Promise<void> {
    const canPublishCamera = await this.canUsePermission(
      state.channelId,
      state.userId,
      Permission.STREAM_CAMERA,
    );
    const canPublishScreen = await this.canUsePermission(
      state.channelId,
      state.userId,
      Permission.SHARE_SCREEN,
    );

    await this.mediaProvider?.enforceVoicePublishPermission({
      canPublishAudio: false,
      canPublishCamera,
      canPublishScreen,
      roomName: createLiveKitRoomName(state.workspaceId, state.channelId),
      userId: state.userId,
    });
  }

  private async canUsePermission(
    channelId: string,
    userId: string,
    permission: Permission,
  ): Promise<boolean> {
    try {
      await this.channelService.requireChannelPermission(channelId, userId, permission);
      return true;
    } catch {
      return false;
    }
  }

  private async publishVoiceState(
    state: VoiceStateRecord | null,
    workspaceId = state?.workspaceId,
    channelId = state?.channelId,
  ): Promise<void> {
    if (!workspaceId || !channelId) {
      return;
    }

    const payload: VoiceStateUpdatePayload = {
      state: state ? toPublicVoiceState(state) : null,
      workspaceId,
    };
    await this.eventPublisher?.publish({
      channelId,
      payload,
      type: ServerGatewayEventType.VOICE_STATE_UPDATE,
      workspaceId,
    });
  }
}

function assertTimeoutDuration(durationSeconds: number): void {
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 60 ||
    durationSeconds > MAX_TIMEOUT_SECONDS
  ) {
    throw badRequest("Timeout duration must be between 60 seconds and 28 days.", {
      field: "durationSeconds",
    });
  }
}

export function toPublicAuditLogEntry(entry: AuditLogEntry): PublicAuditLogEntry {
  return {
    actorId: entry.actorId,
    createdAt: entry.createdAt.toISOString(),
    event: entry.event,
    id: entry.id,
    ipHash: entry.ipHash,
    metadata: entry.metadata,
    reason: entry.reason,
    targetId: entry.targetId,
    targetType: entry.targetType,
    workspaceId: entry.workspaceId,
  };
}

export function toPublicWorkspaceBan(ban: WorkspaceBanRecord): WorkspaceBan {
  return {
    bannedBy: ban.bannedBy,
    createdAt: ban.createdAt.toISOString(),
    id: ban.id,
    reason: ban.reason,
    revokedAt: ban.revokedAt?.toISOString() ?? null,
    revokedBy: ban.revokedBy,
    userId: ban.userId,
    workspaceId: ban.workspaceId,
  };
}

export function toPublicWorkspaceTimeout(timeout: WorkspaceTimeoutRecord): WorkspaceTimeout {
  return {
    createdAt: timeout.createdAt.toISOString(),
    createdBy: timeout.createdBy,
    reason: timeout.reason,
    timedOutUntil: timeout.timedOutUntil.toISOString(),
    updatedAt: timeout.updatedAt.toISOString(),
    userId: timeout.userId,
    workspaceId: timeout.workspaceId,
  };
}
