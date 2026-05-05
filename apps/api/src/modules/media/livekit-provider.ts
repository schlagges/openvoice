import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  type ParticipantInfo,
  type VideoGrant,
} from "livekit-server-sdk";

import type {
  CreateVoiceTokenInput,
  CreateVoiceTokenResult,
  EnforceVoicePublishInput,
  MediaProvider,
} from "./provider.js";

export interface LiveKitMediaProviderOptions {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly serverUrl: string;
  readonly tokenTtlSeconds: number;
}

export class LiveKitMediaProvider implements MediaProvider {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly roomService: RoomServiceClient;
  private readonly serverUrl: string;
  private readonly tokenTtlSeconds: number;

  public constructor(options: LiveKitMediaProviderOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.serverUrl = options.serverUrl;
    this.tokenTtlSeconds = options.tokenTtlSeconds;
    this.roomService = new RoomServiceClient(options.serverUrl, options.apiKey, options.apiSecret);
  }

  public async createVoiceJoinToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.userId,
      name: input.displayName,
      ttl: this.tokenTtlSeconds,
    });
    token.addGrant(createVoiceGrant(input.roomName, input.canPublishAudio));

    return { token: await token.toJwt() };
  }

  public async enforceVoicePublishPermission(input: EnforceVoicePublishInput): Promise<void> {
    await this.roomService
      .updateParticipant(input.roomName, input.userId, {
        permission: createParticipantPermission(input.canPublishAudio),
      })
      .catch(ignoreParticipantNotFound);

    if (!input.canPublishAudio) {
      const participant = await this.roomService
        .getParticipant(input.roomName, input.userId)
        .catch(ignoreParticipantNotFound);
      if (participant) {
        await this.muteMicrophoneTracks(input.roomName, input.userId, participant);
      }
    }
  }

  public get url(): string {
    return this.serverUrl;
  }

  private async muteMicrophoneTracks(
    roomName: string,
    userId: string,
    participant: ParticipantInfo,
  ): Promise<void> {
    const microphoneTracks = participant.tracks.filter(
      (track) => track.source === TrackSource.MICROPHONE && !track.muted,
    );

    await Promise.all(
      microphoneTracks.map((track) =>
        this.roomService.mutePublishedTrack(roomName, userId, track.sid, true),
      ),
    );
  }
}

function createVoiceGrant(roomName: string, canPublishAudio: boolean): VideoGrant {
  return {
    canPublish: canPublishAudio,
    canPublishData: false,
    canPublishSources: canPublishAudio ? [TrackSource.MICROPHONE] : [],
    canSubscribe: true,
    room: roomName,
    roomJoin: true,
  };
}

function createParticipantPermission(canPublishAudio: boolean) {
  return {
    canPublish: canPublishAudio,
    canPublishData: false,
    canPublishSources: canPublishAudio ? [TrackSource.MICROPHONE] : [],
    canSubscribe: true,
  };
}

function ignoreParticipantNotFound(error: unknown): null {
  if (
    typeof error === "object" &&
    error !== null &&
    (("status" in error && error.status === 404) ||
      ("code" in error && error.code === "not_found") ||
      ("message" in error &&
        typeof error.message === "string" &&
        /not found|does not exist/i.test(error.message)))
  ) {
    return null;
  }

  throw error;
}
