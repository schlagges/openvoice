export const AudioMode = {
  LOW_LATENCY: "low_latency",
  MUSIC: "music",
  VOICE: "voice",
} as const;

export type AudioMode = (typeof AudioMode)[keyof typeof AudioMode];

export interface IceServerDefinition {
  readonly credential?: string;
  readonly urls: readonly string[];
  readonly username?: string;
}

export interface VoicePermissions {
  readonly canConnect: boolean;
  readonly canPublishAudio: boolean;
  readonly canSelfDeafen: boolean;
  readonly canSelfMute: boolean;
}

export interface VoiceState {
  readonly audioMode: AudioMode;
  readonly cameraEnabled: false;
  readonly channelId: string;
  readonly connectedAt: string;
  readonly screenShareEnabled: false;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
  readonly serverDeafened: boolean;
  readonly serverMuted: boolean;
  readonly sessionId: string;
  readonly speaking: boolean;
  readonly updatedAt: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface VoiceJoinResponse {
  readonly iceServers: readonly IceServerDefinition[];
  readonly livekitUrl: string;
  readonly permissions: VoicePermissions;
  readonly roomName: string;
  readonly state: VoiceState;
  readonly token: string;
}

export interface VoiceLeaveResponse {
  readonly state: VoiceState | null;
}

export interface VoiceStateUpdatePayload {
  readonly state: VoiceState | null;
  readonly workspaceId: string;
}

export interface SpeakingUpdatePayload {
  readonly channelId: string;
  readonly speaking: boolean;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface IceServersResponse {
  readonly expiresAt: string;
  readonly iceServers: readonly IceServerDefinition[];
}

export function isAudioMode(value: unknown): value is AudioMode {
  return value === AudioMode.LOW_LATENCY || value === AudioMode.MUSIC || value === AudioMode.VOICE;
}
