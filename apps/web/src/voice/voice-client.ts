import {
  Room,
  RoomEvent,
  Track,
  type AudioReceiverStats,
  type AudioSenderStats,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type VideoSenderStats,
} from "livekit-client";
import {
  IceCandidateType,
  RtcTransportProtocol,
  ChannelType,
  VideoContentMode,
  VideoQualityProfile,
} from "@openvoice/shared";
import type {
  ClientRtcQualitySample,
  VideoContentMode as ContentMode,
  VideoQualityProfile as QualityProfile,
  RtcStatsIngestResponse,
  VoiceJoinResponse,
  VoiceState,
} from "@openvoice/shared";

import {
  createCameraCaptureOptions,
  createCameraPublishOptions,
  createScreenShareCaptureOptions,
  createScreenSharePublishOptions,
} from "./media-profiles.js";
import { readSessionCsrfToken, readSessionDisplayName } from "../session.js";

const videoGridTracks = new WeakMap<HTMLElement, VideoTile["track"][]>();

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
  readonly publishedVideoTracks: number;
  readonly remoteVideoTracks: number;
}

export class OpenVoiceVoiceClient {
  private readonly apiBaseUrl: string;
  private canPublishAudio = false;
  private canPublishCamera = false;
  private canPublishScreen = false;
  private canPublishScreen4k = false;
  private csrfToken: string | null;
  private lastSpeaking = false;
  private readonly room: Room;
  private state: VoiceState | null = null;
  private statsReportTimer: ReturnType<typeof setInterval> | null = null;

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
    this.canPublishCamera = response.permissions.canPublishCamera;
    this.canPublishScreen = response.permissions.canPublishScreen;
    this.canPublishScreen4k = response.permissions.canPublishScreen4k;
    this.state = response.state;
    this.attachSpeakingListener(response.state.workspaceId);

    if (response.permissions.canPublishAudio && !response.state.selfMuted) {
      await this.room.localParticipant.setMicrophoneEnabled(true);
    }
    this.startStatsReporting();

    return response;
  }

  public async leave(): Promise<void> {
    this.stopStatsReporting();
    const workspaceId = this.state?.workspaceId;
    if (workspaceId) {
      await this.fetchJson(`/workspaces/${workspaceId}/voice/leave`, { method: "POST" });
    }
    await this.room.disconnect(true);
    this.canPublishAudio = false;
    this.canPublishCamera = false;
    this.canPublishScreen = false;
    this.canPublishScreen4k = false;
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

  public async setCameraEnabled(
    enabled: boolean,
    quality: QualityProfile = VideoQualityProfile.P720,
  ): Promise<VoiceState> {
    if (enabled && !this.canPublishCamera) {
      throw new Error("STREAM_CAMERA permission required.");
    }

    const state = await this.updateSelfState({ cameraEnabled: enabled, cameraQuality: quality });
    try {
      await this.room.localParticipant.setCameraEnabled(
        enabled,
        enabled ? createCameraCaptureOptions(quality) : undefined,
        enabled ? createCameraPublishOptions(quality) : undefined,
      );
    } catch (error) {
      if (enabled) {
        await this.updateSelfState({ cameraEnabled: false }).catch(() => undefined);
      }
      throw error;
    }

    return state;
  }

  public async setScreenShareEnabled(
    enabled: boolean,
    quality: QualityProfile = VideoQualityProfile.P1080,
    contentMode: ContentMode = VideoContentMode.DETAIL,
  ): Promise<VoiceState> {
    if (enabled && !this.canPublishScreen) {
      throw new Error("SHARE_SCREEN permission required.");
    }
    if (enabled && quality === VideoQualityProfile.P4K && !this.canPublishScreen4k) {
      throw new Error("SHARE_SCREEN_4K permission required.");
    }

    const state = await this.updateSelfState({
      screenShareContentMode: contentMode,
      screenShareEnabled: enabled,
      screenShareQuality: quality,
    });
    try {
      const publication = await this.room.localParticipant.setScreenShareEnabled(
        enabled,
        enabled ? createScreenShareCaptureOptions(quality, contentMode) : undefined,
        enabled ? createScreenSharePublishOptions(quality, contentMode) : undefined,
      );
      if (enabled) {
        this.attachScreenStopHandler(publication);
      }
    } catch (error) {
      if (enabled) {
        await this.updateSelfState({ screenShareEnabled: false }).catch(() => undefined);
      }
      throw error;
    }

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
      publishedVideoTracks: this.room.localParticipant.videoTrackPublications.size,
      remoteVideoTracks: countRemoteVideoTracks(this.room),
    };
  }

  public async collectQualitySample(): Promise<ClientRtcQualitySample> {
    if (!this.state) {
      throw new Error("Voice room is not joined.");
    }

    const localAudioTrack = firstLocalAudioTrack(this.room);
    const localAudio = localAudioTrack ? await localAudioTrack.getSenderStats() : undefined;
    const remoteAudio = await collectRemoteAudioStats(this.room);
    const localVideo = await collectLocalVideoStats(this.room);
    const connection = await collectRtcConnectionSummary(this.room);

    return {
      audio: {
        bitrateBps: null,
        concealedSamples: nullableNonNegativeNumber(remoteAudio?.concealedSamples),
        jitterMs: secondsToMilliseconds(remoteAudio?.jitter ?? localAudio?.jitter),
        packetsLost: nonNegativeNumber(remoteAudio?.packetsLost ?? localAudio?.packetsLost),
        packetsReceived: nonNegativeNumber(remoteAudio?.packetsReceived ?? localAudio?.packetsSent),
        rttMs: secondsToMilliseconds(localAudio?.roundTripTime),
      },
      channelId: this.state.channelId,
      connection,
      sessionId: this.state.sessionId,
      timestamp: new Date().toISOString(),
      userId: this.state.userId,
      video: {
        bitrateBps: nullableNonNegativeNumber(localVideo?.targetBitrate),
        framesDropped: null,
        framesPerSecond: nullableNonNegativeNumber(localVideo?.framesPerSecond),
        height: nullableNonNegativeNumber(localVideo?.frameHeight),
        packetsLost: nonNegativeNumber(localVideo?.packetsLost),
        width: nullableNonNegativeNumber(localVideo?.frameWidth),
      },
      workspaceId: this.state.workspaceId,
    };
  }

  public async reportRtcStats(): Promise<void> {
    const sample = await this.collectQualitySample();
    await this.fetchJson<RtcStatsIngestResponse>("/rtc/stats", {
      body: JSON.stringify(toRtcStatsRequestBody(sample)),
      method: "POST",
    });
  }

  public get currentState(): VoiceState | null {
    return this.state;
  }

  public get liveKitRoom(): Room {
    return this.room;
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

  private attachScreenStopHandler(publication: LocalTrackPublication | undefined): void {
    const track = publication?.videoTrack?.mediaStreamTrack;
    track?.addEventListener(
      "ended",
      () => {
        void this.handleScreenShareEnded();
      },
      { once: true },
    );
  }

  private async handleScreenShareEnded(): Promise<void> {
    if (!this.state?.screenShareEnabled) {
      return;
    }

    await this.updateSelfState({ screenShareEnabled: false }).catch(() => undefined);
  }

  private startStatsReporting(): void {
    this.stopStatsReporting();
    void this.reportRtcStats().catch(() => undefined);
    this.statsReportTimer = setInterval(() => {
      void this.reportRtcStats().catch(() => undefined);
    }, 30_000);
  }

  private stopStatsReporting(): void {
    if (!this.statsReportTimer) {
      return;
    }

    clearInterval(this.statsReportTimer);
    this.statsReportTimer = null;
  }

  private async updateSelfState(input: {
    readonly cameraEnabled?: boolean;
    readonly cameraQuality?: QualityProfile;
    readonly screenShareContentMode?: ContentMode;
    readonly screenShareEnabled?: boolean;
    readonly screenShareQuality?: QualityProfile;
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
    const csrfToken = readStoredCsrfToken() ?? this.csrfToken;
    this.csrfToken = csrfToken;
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(csrfToken ? { "x-openvoice-csrf-token": csrfToken } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(await formatVoiceRequestError(response));
    }

    return (await response.json()) as T;
  }
}

export type RtcStatsRequestPayload = Omit<ClientRtcQualitySample, "userId">;

export async function formatVoiceRequestError(response: Response): Promise<string> {
  const errorMessage = await readApiErrorMessage(response);
  if (errorMessage === "Missing CSRF token." || errorMessage === "Invalid CSRF token.") {
    return `${errorMessage} Bitte den aktuellen CSRF-Token per Anleitung neu speichern.`;
  }

  const status = response.status;
  if (status === 401) {
    return "Nicht angemeldet. Bitte erst registrieren oder einloggen und den CSRF-Token im Browser speichern.";
  }

  if (status === 403) {
    return "Kein Zugriff auf diesen Voice-Channel oder fehlende Voice-Rechte.";
  }

  return `OpenVoice voice request failed with ${status}.`;
}

async function readApiErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  return typeof body?.error?.message === "string" ? body.error.message : null;
}

export function toRtcStatsRequestBody(sample: ClientRtcQualitySample): RtcStatsRequestPayload {
  return {
    audio: sample.audio,
    channelId: sample.channelId,
    connection: sample.connection,
    sessionId: sample.sessionId,
    timestamp: sample.timestamp,
    video: sample.video,
    workspaceId: sample.workspaceId,
  };
}

interface ChannelSelectedDetail {
  readonly channelId: string;
  readonly channelName: string;
  readonly channelType: ChannelType;
}

export interface VoiceParticipantView {
  readonly cameraEnabled: boolean;
  readonly identity: string;
  readonly isLocal: boolean;
  readonly isSpeaking: boolean;
  readonly name: string;
  readonly screenShareEnabled: boolean;
  readonly selfDeafened: boolean;
  readonly selfMuted: boolean;
  readonly statusLabel: string;
}

export function mountVoiceControls(root: HTMLElement, client = new OpenVoiceVoiceClient()): void {
  root.insertAdjacentHTML("beforeend", renderVoiceControlsPanel());
  const cameraQuality = root.querySelector<HTMLSelectElement>("#voice-camera-quality");
  const screenQuality = root.querySelector<HTMLSelectElement>("#voice-screen-quality");
  const screenMode = root.querySelector<HTMLSelectElement>("#voice-screen-mode");
  const status = root.querySelector<HTMLOutputElement>("#voice-status");
  const videoGrid = root.querySelector<HTMLElement>("#voice-video-grid");
  const participantStage = root.querySelector<HTMLElement>("#voice-participant-stage");
  const leaveButton = root.querySelector<HTMLButtonElement>("#voice-leave");
  const muteButton = root.querySelector<HTMLButtonElement>("#voice-mute");
  const deafenButton = root.querySelector<HTMLButtonElement>("#voice-deafen");
  const cameraButton = root.querySelector<HTMLButtonElement>("#voice-camera");
  const screenButton = root.querySelector<HTMLButtonElement>("#voice-screen");
  const mediaButtons = [leaveButton, muteButton, deafenButton, cameraButton, screenButton];
  const renderParticipants = (): void => {
    const participants = collectVoiceParticipants(client.liveKitRoom, client.currentState);
    if (participantStage) {
      participantStage.innerHTML = renderVoiceParticipantStage(participants);
    }
    window.dispatchEvent(
      new CustomEvent("openvoice:participants-updated", { detail: { participants } }),
    );
  };
  if (videoGrid) {
    mountVideoGrid(videoGrid, client.liveKitRoom, renderParticipants);
  }
  const setStatus = (text: string): void => {
    if (status) {
      status.value = text;
    }
  };
  const setVoiceActionsEnabled = (enabled: boolean): void => {
    for (const button of mediaButtons) {
      if (button) {
        button.disabled = !enabled;
      }
    }
  };
  const updateControlStates = (): void => {
    const state = client.currentState;
    muteButton?.classList.toggle("is-active", Boolean(state?.selfMuted));
    deafenButton?.classList.toggle("is-active", Boolean(state?.selfDeafened));
    cameraButton?.classList.toggle("is-active", Boolean(state?.cameraEnabled));
    screenButton?.classList.toggle("is-active", Boolean(state?.screenShareEnabled));
    muteButton?.setAttribute(
      "aria-label",
      state?.selfMuted ? "Mikrofon einschalten" : "Mikrofon stummschalten",
    );
    cameraButton?.setAttribute(
      "aria-label",
      state?.cameraEnabled ? "Kamera ausschalten" : "Kamera einschalten",
    );
    screenButton?.setAttribute(
      "aria-label",
      state?.screenShareEnabled ? "Bildschirmfreigabe beenden" : "Bildschirm teilen",
    );
    renderParticipants();
  };
  setVoiceActionsEnabled(false);
  renderParticipants();
  let joiningChannelId: string | null = null;

  const joinChannel = (channelId: string, channelName: string): void => {
    if (!channelId) {
      setStatus("Channel fehlt");
      return;
    }
    if (joiningChannelId === channelId || client.currentState?.channelId === channelId) {
      return;
    }

    joiningChannelId = channelId;
    setVoiceActionsEnabled(false);
    setStatus(`${channelName} wird verbunden.`);
    void client
      .leave()
      .catch(() => undefined)
      .then(() => client.join(channelId))
      .then((result) => {
        joiningChannelId = null;
        setVoiceActionsEnabled(true);
        setStatus(`Verbunden: ${result.roomName}`);
        updateControlStates();
      })
      .catch((error: unknown) => {
        joiningChannelId = null;
        setVoiceActionsEnabled(false);
        setStatus(error instanceof Error ? error.message : "Voice join failed");
        updateControlStates();
      });
  };

  window.addEventListener("openvoice:channel-selected", (event) => {
    const detail = (event as CustomEvent<ChannelSelectedDetail>).detail;
    if (
      !detail ||
      (detail.channelType !== ChannelType.VOICE && detail.channelType !== ChannelType.COMBINED)
    ) {
      return;
    }

    joinChannel(detail.channelId, detail.channelName);
  });

  leaveButton?.addEventListener("click", () => {
    void client
      .leave()
      .then(() => {
        joiningChannelId = null;
        setVoiceActionsEnabled(false);
        setStatus("Getrennt");
        updateControlStates();
      })
      .catch((error: unknown) => {
        setVoiceActionsEnabled(false);
        setStatus(error instanceof Error ? error.message : "Voice leave failed");
      });
  });
  muteButton?.addEventListener("click", () => {
    const nextMuted = !client.currentState?.selfMuted;
    void client.setSelfMuted(nextMuted).then((state) => {
      setStatus(state.selfMuted ? "Stumm" : "Mic an");
      updateControlStates();
    });
  });
  deafenButton?.addEventListener("click", () => {
    const nextDeafened = !client.currentState?.selfDeafened;
    void client.setSelfDeafened(nextDeafened).then((state) => {
      setStatus(state.selfDeafened ? "Taub" : "Audio an");
      updateControlStates();
    });
  });
  cameraButton?.addEventListener("click", () => {
    const nextEnabled = !client.currentState?.cameraEnabled;
    void client
      .setCameraEnabled(nextEnabled, parseQualitySelection(cameraQuality, VideoQualityProfile.P720))
      .then((state) => {
        setStatus(state.cameraEnabled ? "Kamera an" : "Kamera aus");
        updateControlStates();
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Camera failed"),
      );
  });
  screenButton?.addEventListener("click", () => {
    const nextEnabled = !client.currentState?.screenShareEnabled;
    void client
      .setScreenShareEnabled(
        nextEnabled,
        parseQualitySelection(screenQuality, VideoQualityProfile.P1080),
        parseContentModeSelection(screenMode),
      )
      .then((state) => {
        setStatus(state.screenShareEnabled ? "Screen an" : "Screen aus");
        updateControlStates();
      })
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Screenshare failed"),
      );
  });
}

export function renderVoiceControlsPanel(): string {
  return `
      <section class="voice-panel" aria-label="Voice Stage">
        <header class="voice-panel__header">
          <div>
            <p class="eyebrow">Voice Channel</p>
            <h2>Stage</h2>
          </div>
          <output id="voice-status" class="voice-panel__status">Nicht verbunden</output>
        </header>
        <div id="voice-participant-stage" class="voice-participant-stage" aria-label="Teilnehmer"></div>
        <div id="voice-video-grid" class="voice-video-grid" aria-label="Video Grid"></div>
        <div class="voice-panel__actions" aria-label="Voice Aktionen">
          <button id="voice-mute" class="voice-control-button" type="button" disabled aria-label="Mikrofon stummschalten" title="Mikrofon stummschalten">Mic</button>
          <button id="voice-deafen" class="voice-control-button" type="button" disabled aria-label="Deafen" title="Deafen">Audio</button>
          <button id="voice-camera" class="voice-control-button" type="button" disabled aria-label="Kamera einschalten" title="Kamera">Cam</button>
          <button id="voice-screen" class="voice-control-button" type="button" disabled aria-label="Bildschirm teilen" title="Bildschirm teilen">Share</button>
          <button id="voice-leave" class="voice-control-button voice-control-button--danger" type="button" disabled aria-label="Voice verlassen" title="Voice verlassen">Leave</button>
          <details class="voice-panel__settings">
            <summary aria-label="Media Einstellungen" title="Media Einstellungen">⚙</summary>
            <div class="voice-panel__media">
              <label class="voice-panel__field">
                <span>Camera quality</span>
                <select id="voice-camera-quality" class="voice-panel__input">
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="1440p">1440p</option>
                  <option value="4k">4K</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Screen quality</span>
                <select id="voice-screen-quality" class="voice-panel__input">
                  <option value="1080p">1080p</option>
                  <option value="1440p">1440p</option>
                  <option value="4k">4K</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Screen mode</span>
                <select id="voice-screen-mode" class="voice-panel__input">
                  <option value="detail">Detail</option>
                  <option value="motion">Motion</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      </section>
    `;
}

export function mountVideoGrid(root: HTMLElement, room: Room, onRender?: () => void): () => void {
  const render = (): void => {
    renderVideoGrid(root, room);
    onRender?.();
  };

  room.on(RoomEvent.TrackSubscribed, render);
  room.on(RoomEvent.TrackUnsubscribed, render);
  room.on(RoomEvent.TrackPublished, render);
  room.on(RoomEvent.TrackUnpublished, render);
  room.on(RoomEvent.TrackMuted, render);
  room.on(RoomEvent.TrackUnmuted, render);
  room.on(RoomEvent.LocalTrackPublished, render);
  room.on(RoomEvent.LocalTrackUnpublished, render);
  room.on(RoomEvent.ParticipantConnected, render);
  room.on(RoomEvent.ParticipantDisconnected, render);
  render();

  return () => {
    room.off(RoomEvent.TrackSubscribed, render);
    room.off(RoomEvent.TrackUnsubscribed, render);
    room.off(RoomEvent.TrackPublished, render);
    room.off(RoomEvent.TrackUnpublished, render);
    room.off(RoomEvent.TrackMuted, render);
    room.off(RoomEvent.TrackUnmuted, render);
    room.off(RoomEvent.LocalTrackPublished, render);
    room.off(RoomEvent.LocalTrackUnpublished, render);
    room.off(RoomEvent.ParticipantConnected, render);
    room.off(RoomEvent.ParticipantDisconnected, render);
    clearAttachedVideos(root);
  };
}

export function renderVideoGrid(root: HTMLElement, room: Room): void {
  const focusedKey = root.dataset.focusedTrack;
  clearAttachedVideos(root);

  const tiles = collectVideoTiles(room);
  if (tiles.length === 0) {
    delete root.dataset.focusedTrack;
    root.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  const attachedTracks: VideoTile["track"][] = [];
  for (const tile of tiles) {
    const element = document.createElement("button");
    element.className = "voice-video-grid__tile";
    element.dataset.trackKey = tile.key;
    element.type = "button";
    element.setAttribute("aria-label", tile.label);
    if (tile.isScreenShare) {
      element.classList.add("is-screen-share");
    }
    if (focusedKey === tile.key) {
      element.classList.add("is-focused");
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = tile.isLocal;
    video.playsInline = true;
    tile.track.attach(video);
    attachedTracks.push(tile.track);

    const caption = document.createElement("span");
    caption.className = "voice-video-grid__caption";
    caption.textContent = tile.label;

    element.append(video, caption);
    element.addEventListener("click", () => {
      if (root.dataset.focusedTrack === tile.key) {
        delete root.dataset.focusedTrack;
      } else {
        root.dataset.focusedTrack = tile.key;
      }
      renderVideoGrid(root, room);
    });
    fragment.append(element);
  }

  videoGridTracks.set(root, attachedTracks);
  root.replaceChildren(fragment);
}

export function renderVoiceParticipantStage(participants: readonly VoiceParticipantView[]): string {
  if (participants.length === 0) {
    return `
      <div class="voice-stage-empty">
        <div class="voice-stage-empty__icon" aria-hidden="true">◉</div>
        <strong>Kein Voice-Channel verbunden</strong>
        <span>Wähle links einen Voice- oder Chat+Voice-Channel, um beizutreten.</span>
      </div>
    `;
  }

  return `
    <ol class="voice-participant-grid">
      ${participants.map(renderVoiceParticipantCard).join("")}
    </ol>
  `;
}

export function collectVoiceParticipants(
  room: Room,
  state: VoiceState | null,
): VoiceParticipantView[] {
  if (!state) {
    return [];
  }

  const storedDisplayName = readSessionDisplayName();
  const localName = room.localParticipant.name || storedDisplayName;
  const participants: VoiceParticipantView[] = [
    {
      cameraEnabled: Boolean(state.cameraEnabled),
      identity: room.localParticipant.identity || state.userId,
      isLocal: true,
      isSpeaking: room.activeSpeakers.some(
        (participant) => participant.identity === room.localParticipant.identity,
      ),
      name: localName || `Du ${state.userId.slice(0, 8)}`,
      screenShareEnabled: Boolean(state.screenShareEnabled),
      selfDeafened: Boolean(state.selfDeafened || state.serverDeafened),
      selfMuted: Boolean(state.selfMuted || state.serverMuted),
      statusLabel: "Lokaler Teilnehmer",
    },
  ];

  for (const participant of room.remoteParticipants.values()) {
    participants.push({
      cameraEnabled: hasActiveVideo(participant, Track.Source.Camera),
      identity: participant.identity,
      isLocal: false,
      isSpeaking: room.activeSpeakers.some((speaker) => speaker.identity === participant.identity),
      name: participant.name || participant.identity || "Remote",
      screenShareEnabled: hasActiveVideo(participant, Track.Source.ScreenShare),
      selfDeafened: false,
      selfMuted: isRemoteAudioMuted(participant),
      statusLabel: "Remote Teilnehmer",
    });
  }

  return participants;
}

function renderVoiceParticipantCard(participant: VoiceParticipantView): string {
  return `
    <li class="voice-participant-card${participant.isSpeaking ? " is-speaking" : ""}">
      <span class="participant-avatar">${escapeHtml(initials(participant.name))}</span>
      <strong>${escapeHtml(participant.name)}</strong>
      <span>${participant.isLocal ? "Du" : "Verbunden"}</span>
      <span class="participant-status-icons" aria-label="${escapeHtml(participant.statusLabel)}">
        ${participant.selfMuted ? '<span title="Mikrofon stumm">Mic aus</span>' : '<span title="Mikrofon aktiv">Mic</span>'}
        ${participant.selfDeafened ? '<span title="Audio aus">Deaf</span>' : ""}
        ${participant.cameraEnabled ? '<span title="Kamera aktiv">Cam</span>' : ""}
        ${participant.screenShareEnabled ? '<span title="Bildschirm wird geteilt">Share</span>' : ""}
      </span>
    </li>
  `;
}

export interface VideoTile {
  readonly isLocal: boolean;
  readonly key: string;
  readonly label: string;
  readonly isScreenShare: boolean;
  readonly track:
    | NonNullable<LocalTrackPublication["videoTrack"]>
    | NonNullable<RemoteTrackPublication["videoTrack"]>;
}

export function collectVideoTiles(room: Room): VideoTile[] {
  const tiles: VideoTile[] = [];

  for (const publication of room.localParticipant.videoTrackPublications.values()) {
    const track = publication.videoTrack;
    if (!track || publication.isMuted) {
      continue;
    }

    tiles.push({
      isLocal: true,
      key: `local:${publication.trackSid}`,
      label: publication.source === Track.Source.ScreenShare ? "Eigener Screen" : "Eigene Kamera",
      isScreenShare: publication.source === Track.Source.ScreenShare,
      track,
    });
  }

  for (const participant of room.remoteParticipants.values()) {
    collectRemoteVideoTiles(participant, tiles);
  }

  return tiles;
}

function collectRemoteVideoTiles(participant: RemoteParticipant, tiles: VideoTile[]): void {
  const participantName = participant.name ?? participant.identity;

  for (const publication of participant.videoTrackPublications.values()) {
    const track = publication.videoTrack;
    if (!track || publication.isMuted) {
      continue;
    }

    tiles.push({
      isLocal: false,
      key: `remote:${participant.sid}:${publication.trackSid}`,
      label:
        publication.source === Track.Source.ScreenShare
          ? `${participantName} Screen`
          : `${participantName} Kamera`,
      isScreenShare: publication.source === Track.Source.ScreenShare,
      track,
    });
  }
}

function clearAttachedVideos(root: HTMLElement): void {
  const attachedTracks = videoGridTracks.get(root) ?? [];
  for (const track of attachedTracks) {
    track.detach();
  }
  videoGridTracks.delete(root);
  root.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
    video.srcObject = null;
  });
}

function countRemoteVideoTracks(room: Room): number {
  let count = 0;
  for (const participant of room.remoteParticipants.values()) {
    count += participant.videoTrackPublications.size;
  }
  return count;
}

function hasActiveVideo(participant: RemoteParticipant, source: Track.Source): boolean {
  for (const publication of participant.videoTrackPublications.values()) {
    if (publication.source === source && publication.videoTrack && !publication.isMuted) {
      return true;
    }
  }
  return false;
}

function isRemoteAudioMuted(participant: RemoteParticipant): boolean {
  for (const publication of participant.audioTrackPublications.values()) {
    if (!publication.isMuted) {
      return false;
    }
  }
  return participant.audioTrackPublications.size > 0;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseQualitySelection(
  select: HTMLSelectElement | null,
  fallback: QualityProfile,
): QualityProfile {
  switch (select?.value) {
    case VideoQualityProfile.AUTO:
    case VideoQualityProfile.P720:
    case VideoQualityProfile.P1080:
    case VideoQualityProfile.P1440:
    case VideoQualityProfile.P4K:
      return select.value;
    default:
      return fallback;
  }
}

function parseContentModeSelection(select: HTMLSelectElement | null): ContentMode {
  switch (select?.value) {
    case VideoContentMode.MOTION:
      return VideoContentMode.MOTION;
    case VideoContentMode.DETAIL:
    default:
      return VideoContentMode.DETAIL;
  }
}

function defaultApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
}

function readStoredCsrfToken(): string | null {
  return readSessionCsrfToken();
}

function firstLocalAudioTrack(room: Room): LocalAudioTrack | null {
  for (const publication of room.localParticipant.audioTrackPublications.values()) {
    if (publication.audioTrack) {
      return publication.audioTrack;
    }
  }

  return null;
}

function firstRemoteAudioTrack(room: Room): RemoteAudioTrack | null {
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.audioTrackPublications.values()) {
      if (publication.audioTrack) {
        return publication.audioTrack as RemoteAudioTrack;
      }
    }
  }

  return null;
}

async function collectRemoteAudioStats(room: Room): Promise<AudioReceiverStats | null> {
  const remoteAudioTrack = firstRemoteAudioTrack(room);
  return remoteAudioTrack ? ((await remoteAudioTrack.getReceiverStats()) ?? null) : null;
}

function firstLocalVideoTrack(room: Room): LocalVideoTrack | null {
  for (const publication of room.localParticipant.videoTrackPublications.values()) {
    if (publication.videoTrack) {
      return publication.videoTrack;
    }
  }

  return null;
}

async function collectLocalVideoStats(room: Room): Promise<VideoSenderStats | null> {
  const localVideoTrack = firstLocalVideoTrack(room);
  const stats = localVideoTrack ? await localVideoTrack.getSenderStats() : [];
  return stats[0] ?? null;
}

async function collectRtcConnectionSummary(
  room: Room,
): Promise<ClientRtcQualitySample["connection"]> {
  const manager = room.engine.pcManager;
  const iceState = manager?.publisher.getICEConnectionState() ?? "unknown";

  if (!manager) {
    return {
      iceState,
      selectedCandidateType: IceCandidateType.UNKNOWN,
      transport: RtcTransportProtocol.UNKNOWN,
    };
  }

  const reports: RTCStatsReport[] = [];
  const publisherStats = await manager.publisher.getStats().catch(() => null);
  if (publisherStats) {
    reports.push(publisherStats);
  }
  const subscriberStats = await manager.subscriber?.getStats().catch(() => null);
  if (subscriberStats) {
    reports.push(subscriberStats);
  }

  for (const report of reports) {
    const selectedCandidate = extractSelectedCandidate(report);
    if (selectedCandidate) {
      return {
        iceState,
        ...selectedCandidate,
      };
    }
  }

  return {
    iceState,
    selectedCandidateType: IceCandidateType.UNKNOWN,
    transport: RtcTransportProtocol.UNKNOWN,
  };
}

function extractSelectedCandidate(
  report: RTCStatsReport,
): Pick<ClientRtcQualitySample["connection"], "selectedCandidateType" | "transport"> | null {
  let selectedCandidatePairId: string | null = null;
  const candidatePairs = new Map<string, RtcCandidatePairStats>();
  const localCandidates = new Map<string, RtcCandidateStats>();

  report.forEach((stats) => {
    if (stats.type === "transport") {
      const transport = stats as RTCStats & { readonly selectedCandidatePairId?: unknown };
      const selectedId = optionalString(transport.selectedCandidatePairId);
      if (selectedId) {
        selectedCandidatePairId = selectedId;
      }
      return;
    }

    if (stats.type === "candidate-pair") {
      const pair = stats as RTCStats & {
        readonly localCandidateId?: unknown;
        readonly selected?: unknown;
      };
      const localCandidateId = optionalString(pair.localCandidateId);
      const candidatePair = {
        id: pair.id,
        selected: pair.selected === true,
        ...(localCandidateId ? { localCandidateId } : {}),
      };
      candidatePairs.set(pair.id, candidatePair);
      if (!selectedCandidatePairId && pair.selected) {
        selectedCandidatePairId = pair.id;
      }
      return;
    }

    if (stats.type === "local-candidate") {
      const candidate = stats as RTCStats & {
        readonly candidateType?: unknown;
        readonly protocol?: unknown;
        readonly url?: unknown;
      };
      const candidateType = optionalString(candidate.candidateType);
      const protocol = optionalString(candidate.protocol);
      const url = optionalString(candidate.url);
      localCandidates.set(stats.id, {
        id: stats.id,
        ...(candidateType ? { candidateType } : {}),
        ...(protocol ? { protocol } : {}),
        ...(url ? { url } : {}),
      });
    }
  });

  const selectedPair =
    (selectedCandidatePairId ? candidatePairs.get(selectedCandidatePairId) : undefined) ??
    Array.from(candidatePairs.values()).find((pair) => pair.selected);
  const localCandidate = selectedPair?.localCandidateId
    ? localCandidates.get(selectedPair.localCandidateId)
    : undefined;
  if (!localCandidate) {
    return null;
  }

  return {
    selectedCandidateType: normalizeCandidateType(localCandidate.candidateType),
    transport: normalizeTransportProtocol(localCandidate),
  };
}

interface RtcCandidatePairStats {
  readonly id: string;
  readonly localCandidateId?: string;
  readonly selected: boolean;
}

interface RtcCandidateStats {
  readonly candidateType?: string;
  readonly id: string;
  readonly protocol?: string;
  readonly url?: string;
}

function normalizeCandidateType(value: string | undefined): IceCandidateType {
  if (value === IceCandidateType.HOST) {
    return IceCandidateType.HOST;
  }
  if (value === IceCandidateType.RELAY) {
    return IceCandidateType.RELAY;
  }
  if (value === IceCandidateType.SRFLX) {
    return IceCandidateType.SRFLX;
  }

  return IceCandidateType.UNKNOWN;
}

function normalizeTransportProtocol(candidate: RtcCandidateStats): RtcTransportProtocol {
  if (candidate.url?.startsWith("turns:")) {
    return RtcTransportProtocol.TLS;
  }

  if (candidate.protocol === RtcTransportProtocol.UDP) {
    return RtcTransportProtocol.UDP;
  }
  if (candidate.protocol === RtcTransportProtocol.TCP) {
    return RtcTransportProtocol.TCP;
  }

  return RtcTransportProtocol.UNKNOWN;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableNonNegativeNumber(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function nonNegativeNumber(value: number | undefined): number {
  return nullableNonNegativeNumber(value) ?? 0;
}

function secondsToMilliseconds(value: number | undefined): number | null {
  const seconds = nullableNonNegativeNumber(value);
  return seconds === null ? null : seconds * 1000;
}
