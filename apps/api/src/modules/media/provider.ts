export interface CreateVoiceTokenInput {
  readonly canPublishAudio: boolean;
  readonly canPublishCamera: boolean;
  readonly canPublishScreen: boolean;
  readonly displayName: string;
  readonly roomName: string;
  readonly userId: string;
}

export interface CreateVoiceTokenResult {
  readonly token: string;
}

export interface EnforceVoicePublishInput {
  readonly canPublishAudio: boolean;
  readonly canPublishCamera: boolean;
  readonly canPublishScreen: boolean;
  readonly roomName: string;
  readonly userId: string;
}

export interface DisconnectVoiceParticipantInput {
  readonly roomName: string;
  readonly userId: string;
}

export interface MoveVoiceParticipantInput {
  readonly fromRoomName: string;
  readonly toRoomName: string;
  readonly userId: string;
}

export interface MediaProvider {
  createVoiceJoinToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult>;
  disconnectVoiceParticipant(input: DisconnectVoiceParticipantInput): Promise<void>;
  enforceVoicePublishPermission(input: EnforceVoicePublishInput): Promise<void>;
  moveVoiceParticipant(input: MoveVoiceParticipantInput): Promise<void>;
}

export class InMemoryMediaProvider implements MediaProvider {
  public readonly disconnectedParticipants: DisconnectVoiceParticipantInput[] = [];
  public readonly issuedTokens: CreateVoiceTokenInput[] = [];
  public readonly movedParticipants: MoveVoiceParticipantInput[] = [];
  public readonly publishEnforcements: EnforceVoicePublishInput[] = [];

  public async createVoiceJoinToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult> {
    this.issuedTokens.push(input);
    return {
      token: Buffer.from(
        JSON.stringify({
          canPublishAudio: input.canPublishAudio,
          canPublishCamera: input.canPublishCamera,
          canPublishScreen: input.canPublishScreen,
          roomName: input.roomName,
          userId: input.userId,
        }),
      ).toString("base64url"),
    };
  }

  public async enforceVoicePublishPermission(input: EnforceVoicePublishInput): Promise<void> {
    this.publishEnforcements.push(input);
  }

  public async disconnectVoiceParticipant(input: DisconnectVoiceParticipantInput): Promise<void> {
    this.disconnectedParticipants.push(input);
  }

  public async moveVoiceParticipant(input: MoveVoiceParticipantInput): Promise<void> {
    this.movedParticipants.push(input);
  }
}
