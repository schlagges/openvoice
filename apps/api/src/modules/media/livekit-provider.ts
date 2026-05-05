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
    token.addGrant(createVoiceGrant(input));

    return { token: await token.toJwt() };
  }

  public async enforceVoicePublishPermission(input: EnforceVoicePublishInput): Promise<void> {
    await this.roomService
      .updateParticipant(input.roomName, input.userId, {
        permission: createParticipantPermission(input),
      })
      .catch(ignoreParticipantNotFound);

    const participant = await this.roomService
      .getParticipant(input.roomName, input.userId)
      .catch(ignoreParticipantNotFound);
    if (participant) {
      await this.muteDisallowedTracks(input, participant);
    }
  }

  public get url(): string {
    return this.serverUrl;
  }

  private async muteDisallowedTracks(
    input: EnforceVoicePublishInput,
    participant: ParticipantInfo,
  ): Promise<void> {
    const allowedSources = new Set(createPublishSources(input));
    const tracks = participant.tracks.filter(
      (track) => !allowedSources.has(track.source) && !track.muted,
    );

    await Promise.all(
      tracks.map((track) =>
        this.roomService.mutePublishedTrack(input.roomName, input.userId, track.sid, true),
      ),
    );
  }
}

function createVoiceGrant(input: CreateVoiceTokenInput): VideoGrant {
  const sources = createPublishSources(input);
  return {
    canPublish: sources.length > 0,
    canPublishData: false,
    canPublishSources: sources,
    canSubscribe: true,
    room: input.roomName,
    roomJoin: true,
  };
}

function createParticipantPermission(input: EnforceVoicePublishInput) {
  const sources = createPublishSources(input);
  return {
    canPublish: sources.length > 0,
    canPublishData: false,
    canPublishSources: sources,
    canSubscribe: true,
  };
}

function createPublishSources(input: {
  readonly canPublishAudio: boolean;
  readonly canPublishCamera: boolean;
  readonly canPublishScreen: boolean;
}): TrackSource[] {
  const sources: TrackSource[] = [];

  if (input.canPublishAudio) {
    sources.push(TrackSource.MICROPHONE);
  }
  if (input.canPublishCamera) {
    sources.push(TrackSource.CAMERA);
  }
  if (input.canPublishScreen) {
    sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
  }

  return sources;
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
