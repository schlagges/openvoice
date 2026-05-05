import { Room, RoomEvent, type AudioSenderStats, type LocalAudioTrack } from "livekit-client";
import type { VoiceJoinResponse, VoiceState } from "@openvoice/shared";

export interface VoiceClientOptions {
  readonly apiBaseUrl?: string;
  readonly csrfToken?: string;
  readonly room?: Room;
}

export interface VoiceStatsSnapshot {
  readonly activeSpeakerCount: number;
  readonly connected: boolean;
  readonly localAudio?: AudioSenderStats;
  readonly participantCount: number;
  readonly publishedAudioTracks: number;
}

export class OpenVoiceVoiceClient {
  private readonly apiBaseUrl: string;
  private canPublishAudio = false;
  private csrfToken: string | null;
  private lastSpeaking = false;
  private readonly room: Room;
  private state: VoiceState | null = null;

  public constructor(options: VoiceClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? defaultApiBaseUrl();
    this.csrfToken = options.csrfToken ?? readStoredCsrfToken();
    this.room = options.room ?? new Room({ adaptiveStream: true, dynacast: true });
  }

  public async join(channelId: string): Promise<VoiceJoinResponse> {
    const response = await this.fetchJson<VoiceJoinResponse>(`/channels/${channelId}/voice/join`, {
      body: JSON.stringify({ audioMode: "voice", selfDeafened: false, selfMuted: false }),
      method: "POST",
    });
    await this.room.connect(response.livekitUrl, response.token, {
      autoSubscribe: true,
    });
    this.canPublishAudio = response.permissions.canPublishAudio;
    this.state = response.state;
    this.attachSpeakingListener(response.state.workspaceId);

    if (response.permissions.canPublishAudio && !response.state.selfMuted) {
      await this.room.localParticipant.setMicrophoneEnabled(true);
    }

    return response;
  }

  public async leave(): Promise<void> {
    const workspaceId = this.state?.workspaceId;
    if (workspaceId) {
      await this.fetchJson(`/workspaces/${workspaceId}/voice/leave`, { method: "POST" });
    }
    await this.room.disconnect(true);
    this.canPublishAudio = false;
    this.state = null;
    this.lastSpeaking = false;
  }

  public async setSelfMuted(selfMuted: boolean): Promise<VoiceState> {
    const state = await this.updateSelfState({ selfMuted });
    await this.room.localParticipant.setMicrophoneEnabled(
      this.canPublishAudio && !state.selfMuted && !state.serverMuted && !state.serverDeafened,
    );
    return state;
  }

  public async setSelfDeafened(selfDeafened: boolean): Promise<VoiceState> {
    const state = await this.updateSelfState({ selfDeafened });
    if (selfDeafened) {
      await this.room.localParticipant.setMicrophoneEnabled(false);
    }
    return state;
  }

  public async collectStats(): Promise<VoiceStatsSnapshot> {
    const localAudioTrack = firstLocalAudioTrack(this.room);
    const localAudio = localAudioTrack ? await localAudioTrack.getSenderStats() : undefined;

    return {
      activeSpeakerCount: this.room.activeSpeakers.length,
      connected: this.room.state === "connected",
      ...(localAudio ? { localAudio } : {}),
      participantCount: this.room.numParticipants,
      publishedAudioTracks: this.room.localParticipant.audioTrackPublications.size,
    };
  }

  public get currentState(): VoiceState | null {
    return this.state;
  }

  private attachSpeakingListener(workspaceId: string): void {
    this.room.off(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged);
    this.room.on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged);
    this.state = this.state ? { ...this.state, workspaceId } : null;
  }

  private readonly handleActiveSpeakersChanged = (): void => {
    const localIdentity = this.room.localParticipant.identity;
    const speaking = this.room.activeSpeakers.some(
      (participant) => participant.identity === localIdentity,
    );
    if (speaking === this.lastSpeaking || !this.state) {
      return;
    }

    this.lastSpeaking = speaking;
    void this.updateSelfState({ speaking });
  };

  private async updateSelfState(input: {
    readonly selfDeafened?: boolean;
    readonly selfMuted?: boolean;
    readonly speaking?: boolean;
  }): Promise<VoiceState> {
    if (!this.state) {
      throw new Error("Voice room is not joined.");
    }

    const result = await this.fetchJson<{ readonly state: VoiceState }>(
      `/workspaces/${this.state.workspaceId}/voice/state`,
      {
        body: JSON.stringify(input),
        method: "PATCH",
      },
    );
    this.state = result.state;
    return result.state;
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(this.csrfToken ? { "x-openvoice-csrf-token": this.csrfToken } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`OpenVoice voice request failed with ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}

export function mountVoiceControls(root: HTMLElement, client = new OpenVoiceVoiceClient()): void {
  root.insertAdjacentHTML(
    "beforeend",
    `
      <section class="voice-panel" aria-label="Voice">
        <label class="voice-panel__field">
          <span>Voice channel ID</span>
          <input id="voice-channel-id" class="voice-panel__input" autocomplete="off" />
        </label>
        <div class="voice-panel__actions">
          <button id="voice-join" type="button">Join</button>
          <button id="voice-leave" type="button">Leave</button>
          <button id="voice-mute" type="button">Mute</button>
          <button id="voice-deafen" type="button">Deafen</button>
        </div>
        <output id="voice-status" class="voice-panel__status"></output>
      </section>
    `,
  );
  const input = root.querySelector<HTMLInputElement>("#voice-channel-id");
  const status = root.querySelector<HTMLOutputElement>("#voice-status");
  const setStatus = (text: string): void => {
    if (status) {
      status.value = text;
    }
  };

  root.querySelector<HTMLButtonElement>("#voice-join")?.addEventListener("click", () => {
    const channelId = input?.value.trim() ?? "";
    if (!channelId) {
      setStatus("Channel fehlt");
      return;
    }

    void client
      .join(channelId)
      .then((result) => setStatus(`Verbunden: ${result.roomName}`))
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Voice join failed"),
      );
  });
  root.querySelector<HTMLButtonElement>("#voice-leave")?.addEventListener("click", () => {
    void client.leave().then(() => setStatus("Getrennt"));
  });
  root.querySelector<HTMLButtonElement>("#voice-mute")?.addEventListener("click", () => {
    const nextMuted = !client.currentState?.selfMuted;
    void client
      .setSelfMuted(nextMuted)
      .then((state) => setStatus(state.selfMuted ? "Stumm" : "Mic an"));
  });
  root.querySelector<HTMLButtonElement>("#voice-deafen")?.addEventListener("click", () => {
    const nextDeafened = !client.currentState?.selfDeafened;
    void client
      .setSelfDeafened(nextDeafened)
      .then((state) => setStatus(state.selfDeafened ? "Taub" : "Audio an"));
  });
}

function defaultApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
}

function readStoredCsrfToken(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage.getItem("openvoice.csrfToken");
}

function firstLocalAudioTrack(room: Room): LocalAudioTrack | null {
  for (const publication of room.localParticipant.audioTrackPublications.values()) {
    if (publication.audioTrack) {
      return publication.audioTrack;
    }
  }

  return null;
}
