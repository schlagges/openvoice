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

export interface MediaProvider {
  createVoiceJoinToken(input: CreateVoiceTokenInput): Promise<CreateVoiceTokenResult>;
  enforceVoicePublishPermission(input: EnforceVoicePublishInput): Promise<void>;
}

export class InMemoryMediaProvider implements MediaProvider {
  public readonly issuedTokens: CreateVoiceTokenInput[] = [];
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
}
