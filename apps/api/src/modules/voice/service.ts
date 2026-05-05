import {
  ChannelType,
  Permission,
  ServerGatewayEventType,
  type AudioMode,
  type IceServersResponse,
  type SpeakingUpdatePayload,
  type VoiceJoinResponse,
  type VoiceLeaveResponse,
  type VoiceState,
  type VoiceStateUpdatePayload,
} from "@openvoice/shared";

import type { VoiceStateRecord } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { badRequest, forbidden, notFound } from "../../http/errors.js";
import type { ChannelService } from "../channels/service.js";
import type { GatewayEventPublisher } from "../gateway/events.js";
import type { MediaProvider } from "../media/provider.js";
import type { TurnCredentialService } from "../turn/credentials.js";

export interface VoiceServiceOptions {
  readonly channelService: ChannelService;
  readonly eventPublisher?: GatewayEventPublisher;
  readonly livekitUrl: string;
  readonly mediaProvider: MediaProvider;
  readonly repository: OpenVoiceRepository;
  readonly turnCredentialService: TurnCredentialService;
}

export interface JoinVoiceCommand {
  readonly audioMode: AudioMode;
  readonly channelId: string;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
  readonly sessionId: string;
  readonly userId: string;
}

export interface UpdateVoiceSelfStateCommand {
  readonly audioMode?: AudioMode;
  readonly selfDeafened?: boolean;
  readonly selfMuted?: boolean;
  readonly speaking?: boolean;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ModerateVoiceCommand {
  readonly actorId: string;
  readonly enabled: boolean;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export class VoiceService {
  private readonly channelService: ChannelService;
  private readonly eventPublisher: GatewayEventPublisher | null;
  private readonly livekitUrl: string;
  private readonly mediaProvider: MediaProvider;
  private readonly repository: OpenVoiceRepository;
  private readonly turnCredentialService: TurnCredentialService;

  public constructor(options: VoiceServiceOptions) {
    this.channelService = options.channelService;
    this.eventPublisher = options.eventPublisher ?? null;
    this.livekitUrl = options.livekitUrl;
    this.mediaProvider = options.mediaProvider;
    this.repository = options.repository;
    this.turnCredentialService = options.turnCredentialService;
  }

  public async join(command: JoinVoiceCommand): Promise<VoiceJoinResponse> {
    await this.channelService.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.VIEW_CHANNEL,
    );
    const { channel } = await this.channelService.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.CONNECT_VOICE,
    );

    if (channel.type !== ChannelType.VOICE && channel.type !== ChannelType.COMBINED) {
      throw badRequest("Voice join is only allowed for voice and combined channels.", {
        field: "channelId",
      });
    }

    const user = await this.repository.findUserById(command.userId);
    if (!user) {
      throw forbidden("Workspace access required.");
    }

    const canSpeak = await this.canUsePermission(
      command.channelId,
      command.userId,
      Permission.SPEAK,
    );
    const state = await this.repository.upsertVoiceState({
      audioMode: command.audioMode,
      channelId: command.channelId,
      selfDeafened: command.selfDeafened,
      selfMuted: command.selfDeafened ? true : command.selfMuted,
      sessionId: command.sessionId,
      userId: command.userId,
      workspaceId: channel.workspaceId,
    });
    const canPublishAudio =
      canSpeak && !state.serverMuted && !state.serverDeafened && !state.selfDeafened;
    const roomName = createLiveKitRoomName(channel.workspaceId, command.channelId);
    const token = await this.mediaProvider.createVoiceJoinToken({
      canPublishAudio,
      displayName: user.displayName,
      roomName,
      userId: command.userId,
    });
    const ice = this.turnCredentialService.createIceServers({ userId: command.userId });

    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio,
      roomName,
      userId: command.userId,
    });
    await this.publishVoiceState(state);

    return {
      iceServers: ice.iceServers,
      livekitUrl: this.livekitUrl,
      permissions: {
        canConnect: true,
        canPublishAudio,
        canSelfDeafen: true,
        canSelfMute: true,
      },
      roomName,
      state: toPublicVoiceState(state),
      token: token.token,
    };
  }

  public async leave(workspaceId: string, userId: string): Promise<VoiceLeaveResponse> {
    const state = await this.repository.deleteVoiceState(workspaceId, userId);
    if (state) {
      await this.publishVoiceState(null, state.workspaceId, state.channelId);
    }

    return { state: null };
  }

  public async updateSelfState(command: UpdateVoiceSelfStateCommand): Promise<VoiceState> {
    const existing = await this.repository.findVoiceState(command.workspaceId, command.userId);
    if (!existing) {
      throw notFound("Voice state not found.");
    }

    await this.channelService.requireChannelPermission(
      existing.channelId,
      command.userId,
      Permission.VIEW_CHANNEL,
    );
    const canSpeak = await this.canUsePermission(
      existing.channelId,
      command.userId,
      Permission.SPEAK,
    );
    const state = await this.repository.updateVoiceSelfState({
      ...(command.audioMode !== undefined ? { audioMode: command.audioMode } : {}),
      ...(command.selfDeafened !== undefined ? { selfDeafened: command.selfDeafened } : {}),
      ...(command.selfMuted !== undefined ? { selfMuted: command.selfMuted } : {}),
      ...(command.speaking !== undefined
        ? { speaking: command.speaking && canSpeak && !existing.serverMuted }
        : {}),
      userId: command.userId,
      workspaceId: command.workspaceId,
    });

    if (!state) {
      throw notFound("Voice state not found.");
    }

    const canPublishAudio =
      canSpeak && !state.serverMuted && !state.serverDeafened && !state.selfDeafened;
    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio,
      roomName: createLiveKitRoomName(state.workspaceId, state.channelId),
      userId: command.userId,
    });
    await this.publishVoiceState(state);

    if (command.speaking !== undefined) {
      await this.publishSpeakingUpdate(state);
    }

    return toPublicVoiceState(state);
  }

  public async serverMute(command: ModerateVoiceCommand): Promise<VoiceState> {
    return this.setServerModerationState(command, Permission.MUTE_MEMBERS, {
      serverMuted: command.enabled,
    });
  }

  public async serverDeafen(command: ModerateVoiceCommand): Promise<VoiceState> {
    return this.setServerModerationState(command, Permission.DEAFEN_MEMBERS, {
      serverDeafened: command.enabled,
    });
  }

  public createIceServers(userId: string): IceServersResponse {
    return this.turnCredentialService.createIceServers({ userId });
  }

  private async setServerModerationState(
    command: ModerateVoiceCommand,
    requiredPermission: Permission,
    moderationState: { readonly serverDeafened?: boolean; readonly serverMuted?: boolean },
  ): Promise<VoiceState> {
    const targetState = await this.repository.findVoiceState(
      command.workspaceId,
      command.targetUserId,
    );
    if (!targetState) {
      throw notFound("Voice state not found.");
    }

    await this.channelService.requireChannelPermission(
      targetState.channelId,
      command.actorId,
      requiredPermission,
    );

    const state = await this.repository.setVoiceModerationState({
      actorId: command.actorId,
      ...moderationState,
      targetUserId: command.targetUserId,
      workspaceId: command.workspaceId,
    });
    if (!state) {
      throw notFound("Voice state not found.");
    }

    const canSpeak = await this.canUsePermission(state.channelId, state.userId, Permission.SPEAK);
    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio: canSpeak && !state.serverMuted && !state.serverDeafened,
      roomName: createLiveKitRoomName(state.workspaceId, state.channelId),
      userId: state.userId,
    });
    await this.publishVoiceState(state);

    return toPublicVoiceState(state);
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

  private async publishSpeakingUpdate(state: VoiceStateRecord): Promise<void> {
    const payload: SpeakingUpdatePayload = {
      channelId: state.channelId,
      speaking: state.speaking,
      userId: state.userId,
      workspaceId: state.workspaceId,
    };
    await this.eventPublisher?.publish({
      channelId: state.channelId,
      payload,
      type: ServerGatewayEventType.SPEAKING_UPDATE,
      workspaceId: state.workspaceId,
    });
  }
}

function createLiveKitRoomName(workspaceId: string, channelId: string): string {
  return `openvoice_${workspaceId}_${channelId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function toPublicVoiceState(state: VoiceStateRecord): VoiceState {
  return {
    audioMode: state.audioMode,
    cameraEnabled: false,
    channelId: state.channelId,
    connectedAt: state.connectedAt.toISOString(),
    screenShareEnabled: false,
    selfDeafened: state.selfDeafened,
    selfMuted: state.selfMuted,
    serverDeafened: state.serverDeafened,
    serverMuted: state.serverMuted,
    sessionId: state.sessionId,
    speaking: state.speaking,
    updatedAt: state.updatedAt.toISOString(),
    userId: state.userId,
    workspaceId: state.workspaceId,
  };
}
