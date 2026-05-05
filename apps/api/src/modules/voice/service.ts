import {
  ChannelType,
  Permission,
  ServerGatewayEventType,
  type AudioMode,
  type IceServersResponse,
  type SpeakingUpdatePayload,
  VideoQualityProfile,
  type VoiceJoinResponse,
  type VoiceLeaveResponse,
  type VoicePermissions,
  type VoiceState,
  type VoiceStateUpdatePayload,
  type VideoContentMode,
  type VideoQualityProfile as QualityProfile,
} from "@openvoice/shared";

import type { VoiceStateRecord } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { badRequest, forbidden, notFound } from "../../http/errors.js";
import type { ChannelService } from "../channels/service.js";
import type { GatewayEventPublisher } from "../gateway/events.js";
import type { MediaProvider } from "../media/provider.js";
import { assertCanModerateMember } from "../moderation/hierarchy.js";
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
  readonly cameraEnabled?: boolean;
  readonly cameraQuality?: QualityProfile;
  readonly screenShareContentMode?: VideoContentMode;
  readonly screenShareEnabled?: boolean;
  readonly screenShareQuality?: QualityProfile;
  readonly selfDeafened?: boolean;
  readonly selfMuted?: boolean;
  readonly speaking?: boolean;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface ModerateVoiceCommand {
  readonly actorId: string;
  readonly enabled: boolean;
  readonly reason?: string | null;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface MoveVoiceMemberCommand {
  readonly actorId: string;
  readonly reason?: string | null;
  readonly targetChannelId: string;
  readonly targetUserId: string;
  readonly workspaceId: string;
}

export interface DisconnectVoiceMemberCommand {
  readonly actorId: string;
  readonly reason?: string | null;
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

    const permissions = await this.resolvePublishPermissions(
      command.channelId,
      command.userId,
      channel.workspaceId,
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
      permissions.canPublishAudio &&
      !state.serverMuted &&
      !state.serverDeafened &&
      !state.selfDeafened;
    const roomName = createLiveKitRoomName(channel.workspaceId, command.channelId);
    const token = await this.mediaProvider.createVoiceJoinToken({
      canPublishAudio,
      canPublishCamera: permissions.canPublishCamera,
      canPublishScreen: permissions.canPublishScreen,
      displayName: user.displayName,
      roomName,
      userId: command.userId,
    });
    const ice = this.turnCredentialService.createIceServers({ userId: command.userId });

    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio,
      canPublishCamera: permissions.canPublishCamera,
      canPublishScreen: permissions.canPublishScreen,
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
        canPublishCamera: permissions.canPublishCamera,
        canPublishScreen: permissions.canPublishScreen,
        canPublishScreen4k: permissions.canPublishScreen4k,
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
    const permissions = await this.resolvePublishPermissions(
      existing.channelId,
      command.userId,
      existing.workspaceId,
    );
    this.assertMediaStateAllowed(command, existing, permissions);
    const state = await this.repository.updateVoiceSelfState({
      ...(command.audioMode !== undefined ? { audioMode: command.audioMode } : {}),
      ...(command.cameraEnabled !== undefined ? { cameraEnabled: command.cameraEnabled } : {}),
      ...(command.cameraQuality !== undefined ? { cameraQuality: command.cameraQuality } : {}),
      ...(command.screenShareContentMode !== undefined
        ? { screenShareContentMode: command.screenShareContentMode }
        : {}),
      ...(command.screenShareEnabled !== undefined
        ? { screenShareEnabled: command.screenShareEnabled }
        : {}),
      ...(command.screenShareQuality !== undefined
        ? { screenShareQuality: command.screenShareQuality }
        : {}),
      ...(command.selfDeafened !== undefined ? { selfDeafened: command.selfDeafened } : {}),
      ...(command.selfMuted !== undefined ? { selfMuted: command.selfMuted } : {}),
      ...(command.speaking !== undefined
        ? {
            speaking:
              command.speaking &&
              permissions.canPublishAudio &&
              !existing.serverMuted &&
              !existing.serverDeafened,
          }
        : {}),
      userId: command.userId,
      workspaceId: command.workspaceId,
    });

    if (!state) {
      throw notFound("Voice state not found.");
    }

    const canPublishAudio =
      permissions.canPublishAudio &&
      !state.serverMuted &&
      !state.serverDeafened &&
      !state.selfDeafened;
    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio,
      canPublishCamera: permissions.canPublishCamera,
      canPublishScreen: permissions.canPublishScreen,
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

  public async moveMember(command: MoveVoiceMemberCommand): Promise<VoiceState> {
    const targetState = await this.repository.findVoiceState(
      command.workspaceId,
      command.targetUserId,
    );
    if (!targetState) {
      throw notFound("Voice state not found.");
    }

    const source = await this.channelService.requireChannelPermission(
      targetState.channelId,
      command.actorId,
      Permission.MOVE_MEMBERS,
    );
    const destination = await this.channelService.requireChannelPermission(
      command.targetChannelId,
      command.actorId,
      Permission.MOVE_MEMBERS,
    );
    if (
      source.channel.workspaceId !== command.workspaceId ||
      destination.channel.workspaceId !== command.workspaceId
    ) {
      throw notFound("Channel not found.");
    }
    if (
      destination.channel.type !== ChannelType.VOICE &&
      destination.channel.type !== ChannelType.COMBINED
    ) {
      throw badRequest("Voice members can only be moved into voice and combined channels.", {
        field: "channelId",
      });
    }
    await assertCanModerateMember({
      actorAccess: source.access,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });
    await this.channelService.requireChannelPermission(
      command.targetChannelId,
      command.targetUserId,
      Permission.VIEW_CHANNEL,
    );
    await this.channelService.requireChannelPermission(
      command.targetChannelId,
      command.targetUserId,
      Permission.CONNECT_VOICE,
    );

    const result = await this.repository.moveVoiceMember({
      actorId: command.actorId,
      reason: command.reason ?? null,
      targetChannelId: command.targetChannelId,
      targetUserId: command.targetUserId,
      workspaceId: command.workspaceId,
    });
    if (!result) {
      throw notFound("Voice state not found.");
    }

    await this.mediaProvider.moveVoiceParticipant({
      fromRoomName: createLiveKitRoomName(command.workspaceId, result.previousChannelId),
      toRoomName: createLiveKitRoomName(command.workspaceId, result.state.channelId),
      userId: command.targetUserId,
    });
    await this.enforceCurrentPublishPermissions(result.state);
    await this.publishVoiceState(null, result.state.workspaceId, result.previousChannelId);
    await this.publishVoiceState(result.state);

    return toPublicVoiceState(result.state);
  }

  public async disconnectMember(command: DisconnectVoiceMemberCommand): Promise<VoiceState> {
    const targetState = await this.repository.findVoiceState(
      command.workspaceId,
      command.targetUserId,
    );
    if (!targetState) {
      throw notFound("Voice state not found.");
    }

    const source = await this.channelService.requireChannelPermission(
      targetState.channelId,
      command.actorId,
      Permission.DISCONNECT_MEMBERS,
    );
    if (source.channel.workspaceId !== command.workspaceId) {
      throw notFound("Channel not found.");
    }
    await assertCanModerateMember({
      actorAccess: source.access,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });

    const result = await this.repository.disconnectVoiceMember({
      actorId: command.actorId,
      reason: command.reason ?? null,
      targetUserId: command.targetUserId,
      workspaceId: command.workspaceId,
    });
    if (!result) {
      throw notFound("Voice state not found.");
    }

    await this.mediaProvider.disconnectVoiceParticipant({
      roomName: createLiveKitRoomName(result.state.workspaceId, result.state.channelId),
      userId: command.targetUserId,
    });
    await this.publishVoiceState(null, result.state.workspaceId, result.state.channelId);

    return toPublicVoiceState(result.state);
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

    const permissionResult = await this.channelService.requireChannelPermission(
      targetState.channelId,
      command.actorId,
      requiredPermission,
    );
    await assertCanModerateMember({
      actorAccess: permissionResult.access,
      repository: this.repository,
      targetUserId: command.targetUserId,
    });

    const state = await this.repository.setVoiceModerationState({
      actorId: command.actorId,
      ...moderationState,
      reason: command.reason ?? null,
      targetUserId: command.targetUserId,
      workspaceId: command.workspaceId,
    });
    if (!state) {
      throw notFound("Voice state not found.");
    }

    await this.enforceCurrentPublishPermissions(state);
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

  private async resolvePublishPermissions(
    channelId: string,
    userId: string,
    workspaceId: string,
  ): Promise<
    Pick<
      VoicePermissions,
      "canPublishAudio" | "canPublishCamera" | "canPublishScreen" | "canPublishScreen4k"
    >
  > {
    const canPublishAudio = await this.canUsePermission(channelId, userId, Permission.SPEAK);
    const canPublishCamera = await this.canUsePermission(
      channelId,
      userId,
      Permission.STREAM_CAMERA,
    );
    const canPublishScreen = await this.canUsePermission(
      channelId,
      userId,
      Permission.SHARE_SCREEN,
    );
    const canPublishScreen4k =
      canPublishScreen &&
      (await this.canUsePermission(channelId, userId, Permission.SHARE_SCREEN_4K));
    const activeTimeout = await this.repository.findActiveWorkspaceTimeout(
      workspaceId,
      userId,
      new Date(),
    );

    return {
      canPublishAudio: canPublishAudio && !activeTimeout,
      canPublishCamera,
      canPublishScreen,
      canPublishScreen4k,
    };
  }

  private async enforceCurrentPublishPermissions(state: VoiceStateRecord): Promise<void> {
    const permissions = await this.resolvePublishPermissions(
      state.channelId,
      state.userId,
      state.workspaceId,
    );
    await this.mediaProvider.enforceVoicePublishPermission({
      canPublishAudio:
        permissions.canPublishAudio &&
        !state.serverMuted &&
        !state.serverDeafened &&
        !state.selfDeafened,
      canPublishCamera: permissions.canPublishCamera,
      canPublishScreen: permissions.canPublishScreen,
      roomName: createLiveKitRoomName(state.workspaceId, state.channelId),
      userId: state.userId,
    });
  }

  private assertMediaStateAllowed(
    command: UpdateVoiceSelfStateCommand,
    existing: VoiceStateRecord,
    permissions: Pick<
      VoicePermissions,
      "canPublishCamera" | "canPublishScreen" | "canPublishScreen4k"
    >,
  ): void {
    const cameraEnabled = command.cameraEnabled ?? existing.cameraEnabled;
    const screenShareEnabled = command.screenShareEnabled ?? existing.screenShareEnabled;
    const screenShareQuality = command.screenShareQuality ?? existing.screenShareQuality;

    if (cameraEnabled && !permissions.canPublishCamera) {
      throw forbidden("STREAM_CAMERA permission required.", {
        permission: "STREAM_CAMERA",
      });
    }

    if (screenShareEnabled && !permissions.canPublishScreen) {
      throw forbidden("SHARE_SCREEN permission required.", {
        permission: "SHARE_SCREEN",
      });
    }

    if (
      screenShareQuality === VideoQualityProfile.P4K &&
      (screenShareEnabled || command.screenShareQuality !== undefined) &&
      !permissions.canPublishScreen4k
    ) {
      throw forbidden("SHARE_SCREEN_4K permission required for 4K screenshare.", {
        permission: "SHARE_SCREEN_4K",
      });
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

export function createLiveKitRoomName(workspaceId: string, channelId: string): string {
  return `openvoice_${workspaceId}_${channelId}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function toPublicVoiceState(state: VoiceStateRecord): VoiceState {
  return {
    audioMode: state.audioMode,
    cameraEnabled: state.cameraEnabled,
    cameraQuality: state.cameraQuality,
    channelId: state.channelId,
    connectedAt: state.connectedAt.toISOString(),
    screenShareContentMode: state.screenShareContentMode,
    screenShareEnabled: state.screenShareEnabled,
    screenShareQuality: state.screenShareQuality,
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
