export const AudioMode = {
  LOW_LATENCY: "low_latency",
  MUSIC: "music",
  VOICE: "voice",
} as const;

export type AudioMode = (typeof AudioMode)[keyof typeof AudioMode];

export const VideoContentMode = {
  DETAIL: "detail",
  MOTION: "motion",
} as const;

export type VideoContentMode = (typeof VideoContentMode)[keyof typeof VideoContentMode];

export const VideoQualityProfile = {
  AUTO: "auto",
  P720: "720p",
  P1080: "1080p",
  P1440: "1440p",
  P4K: "4k",
} as const;

export type VideoQualityProfile = (typeof VideoQualityProfile)[keyof typeof VideoQualityProfile];

export interface IceServerDefinition {
  readonly credential?: string;
  readonly urls: readonly string[];
  readonly username?: string;
}

export interface VoicePermissions {
  readonly canConnect: boolean;
  readonly canPublishAudio: boolean;
  readonly canPublishCamera: boolean;
  readonly canPublishScreen: boolean;
  readonly canPublishScreen4k: boolean;
  readonly canSelfDeafen: boolean;
  readonly canSelfMute: boolean;
}

export interface VoiceState {
  readonly audioMode: AudioMode;
  readonly cameraEnabled: boolean;
  readonly cameraQuality: VideoQualityProfile;
  readonly channelId: string;
  readonly connectedAt: string;
  readonly screenShareContentMode: VideoContentMode;
  readonly screenShareEnabled: boolean;
  readonly screenShareQuality: VideoQualityProfile;
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

export interface VoiceParticipant {
  readonly state: VoiceState;
  readonly user: {
    readonly displayName: string;
    readonly id: string;
  };
}

export interface VoiceParticipantsResponse {
  readonly participants: readonly VoiceParticipant[];
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

export function isVideoContentMode(value: unknown): value is VideoContentMode {
  return value === VideoContentMode.DETAIL || value === VideoContentMode.MOTION;
}

export function isVideoQualityProfile(value: unknown): value is VideoQualityProfile {
  return (
    value === VideoQualityProfile.AUTO ||
    value === VideoQualityProfile.P720 ||
    value === VideoQualityProfile.P1080 ||
    value === VideoQualityProfile.P1440 ||
    value === VideoQualityProfile.P4K
  );
}
