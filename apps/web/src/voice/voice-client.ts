import {
  Room,
  RoomEvent,
  Track,
  type AudioReceiverStats,
  type AudioSenderStats,
  type AudioCaptureOptions,
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
  VoiceParticipant,
  VoiceParticipantsResponse,
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
const remoteAudioTracks = new WeakMap<HTMLElement, RemoteAudioTrack[]>();
const AUDIO_INPUT_DEVICE_STORAGE_KEY = "openvoice.audioInputDeviceId";
const AUDIO_OUTPUT_DEVICE_STORAGE_KEY = "openvoice.audioOutputDeviceId";
const VIDEO_INPUT_DEVICE_STORAGE_KEY = "openvoice.videoInputDeviceId";

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
  private microphoneError: string | null = null;
  private audioInputDeviceId: string | null = readStoredDeviceId(AUDIO_INPUT_DEVICE_STORAGE_KEY);
  private audioOutputDeviceId: string | null = readStoredDeviceId(AUDIO_OUTPUT_DEVICE_STORAGE_KEY);
  private videoInputDeviceId: string | null = readStoredDeviceId(VIDEO_INPUT_DEVICE_STORAGE_KEY);
  private participantPollTimer: ReturnType<typeof setInterval> | null = null;
  private serverParticipants: readonly VoiceParticipant[] = [];
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
      peerConnectionTimeout: 25_000,
      rtcConfig: {
        iceServers: toRtcIceServers(response.iceServers),
      },
    });
    await this.room.startAudio().catch(() => undefined);
    this.canPublishAudio = response.permissions.canPublishAudio;
    this.canPublishCamera = response.permissions.canPublishCamera;
    this.canPublishScreen = response.permissions.canPublishScreen;
    this.canPublishScreen4k = response.permissions.canPublishScreen4k;
    this.state = response.state;
    await this.refreshParticipants();
    this.attachSpeakingListener(response.state.workspaceId);

    if (response.permissions.canPublishAudio && !response.state.selfMuted) {
      await this.enableMicrophoneOrMarkMuted();
    }
    this.startStatsReporting();
    this.startParticipantPolling();

    return response;
  }

  public get lastMicrophoneError(): string | null {
    return this.microphoneError;
  }

  public async leave(): Promise<void> {
    this.stopStatsReporting();
    this.stopParticipantPolling();
    const workspaceId = this.state?.workspaceId;
    if (workspaceId) {
      await this.fetchJson(`/workspaces/${workspaceId}/voice/leave`, { method: "POST" });
    }
    await this.room.disconnect(true);
    this.canPublishAudio = false;
    this.canPublishCamera = false;
    this.canPublishScreen = false;
    this.canPublishScreen4k = false;
    this.serverParticipants = [];
    this.state = null;
    this.lastSpeaking = false;
  }

  public async setSelfMuted(selfMuted: boolean): Promise<VoiceState> {
    const state = await this.updateSelfState({ selfMuted });
    const microphoneEnabled =
      this.canPublishAudio && !state.selfMuted && !state.serverMuted && !state.serverDeafened;
    if (microphoneEnabled) {
      await this.enableMicrophoneOrMarkMuted();
      return this.state ?? state;
    }

    this.microphoneError = null;
    await this.room.localParticipant.setMicrophoneEnabled(false);
    return state;
  }

  public async setAudioInputDevice(deviceId: string): Promise<void> {
    const normalizedDeviceId = deviceId.trim();
    this.audioInputDeviceId = normalizedDeviceId || null;
    storeDeviceId(AUDIO_INPUT_DEVICE_STORAGE_KEY, this.audioInputDeviceId);
    if (!this.state || this.state.selfMuted || this.state.serverMuted || this.state.serverDeafened) {
      return;
    }

    await this.room.switchActiveDevice(
      "audioinput",
      this.audioInputDeviceId ?? "default",
      Boolean(this.audioInputDeviceId),
    );
  }

  public async setAudioOutputDevice(deviceId: string): Promise<void> {
    const normalizedDeviceId = deviceId.trim();
    this.audioOutputDeviceId = normalizedDeviceId || null;
    storeDeviceId(AUDIO_OUTPUT_DEVICE_STORAGE_KEY, this.audioOutputDeviceId);
    await this.room.switchActiveDevice(
      "audiooutput",
      this.audioOutputDeviceId ?? "default",
      Boolean(this.audioOutputDeviceId),
    );
  }

  public async setVideoInputDevice(deviceId: string): Promise<void> {
    const normalizedDeviceId = deviceId.trim();
    this.videoInputDeviceId = normalizedDeviceId || null;
    storeDeviceId(VIDEO_INPUT_DEVICE_STORAGE_KEY, this.videoInputDeviceId);
    if (!this.state?.cameraEnabled) {
      return;
    }

    await this.room.switchActiveDevice(
      "videoinput",
      this.videoInputDeviceId ?? "default",
      Boolean(this.videoInputDeviceId),
    );
  }

  public async refreshParticipants(): Promise<readonly VoiceParticipant[]> {
    if (!this.state) {
      this.serverParticipants = [];
      return this.serverParticipants;
    }

    const result = await this.fetchJson<VoiceParticipantsResponse>(
      `/channels/${this.state.channelId}/voice/participants`,
    );
    this.serverParticipants = result.participants;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("openvoice:voice-participants-refreshed"));
    }
    return this.serverParticipants;
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
        enabled ? createCameraCaptureOptions(quality, this.videoInputDeviceId) : undefined,
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
    return this.updateSelfState({ selfDeafened });
  }

  public async setSelfMutedAndDeafened(enabled: boolean): Promise<VoiceState> {
    const state = await this.updateSelfState({ selfDeafened: enabled, selfMuted: enabled });
    if (!enabled && this.canPublishAudio && !state.serverMuted && !state.serverDeafened) {
      await this.enableMicrophoneOrMarkMuted();
      return this.state ?? state;
    }

    if (enabled) {
      this.microphoneError = null;
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
        rttMs: secondsToMilliseconds(localAudio?.roundTripTime) ?? connection.rttMs,
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

  public get currentParticipants(): readonly VoiceParticipant[] {
    return this.serverParticipants;
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

  private startParticipantPolling(): void {
    this.stopParticipantPolling();
    this.participantPollTimer = setInterval(() => {
      void this.refreshParticipants().catch(() => undefined);
    }, 5_000);
  }

  private stopParticipantPolling(): void {
    if (!this.participantPollTimer) {
      return;
    }

    clearInterval(this.participantPollTimer);
    this.participantPollTimer = null;
  }

  private stopStatsReporting(): void {
    if (!this.statsReportTimer) {
      return;
    }

    clearInterval(this.statsReportTimer);
    this.statsReportTimer = null;
  }

  private async enableMicrophoneOrMarkMuted(): Promise<void> {
    try {
      await this.room.localParticipant.setMicrophoneEnabled(
        true,
        createAudioCaptureOptions(this.audioInputDeviceId),
      );
      this.microphoneError = null;
    } catch (error) {
      this.microphoneError = formatMicrophoneError(error);
      if (this.state && !this.state.selfMuted) {
        await this.updateSelfState({ selfMuted: true }).catch(() => undefined);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("openvoice:microphone-error", {
            detail: { message: this.microphoneError },
          }),
        );
      }
    }
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
    void this.refreshParticipants().catch(() => undefined);
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
        ...authHeader(),
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

function createAudioCaptureOptions(deviceId: string | null): AudioCaptureOptions | undefined {
  return deviceId ? { deviceId: { exact: deviceId } } : undefined;
}

async function refreshMediaDeviceSelects(selects: {
  readonly audioInput: HTMLSelectElement | null;
  readonly audioOutput: HTMLSelectElement | null;
  readonly videoInput: HTMLSelectElement | null;
}): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    setSelectUnavailable(selects.audioInput, "Keine Geraeteliste");
    setSelectUnavailable(selects.audioOutput, "Keine Geraeteliste");
    setSelectUnavailable(selects.videoInput, "Keine Geraeteliste");
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  updateDeviceSelect(
    selects.audioInput,
    devices.filter((device) => device.kind === "audioinput"),
    "Standard-Mikrofon",
    readStoredDeviceId(AUDIO_INPUT_DEVICE_STORAGE_KEY),
  );
  updateDeviceSelect(
    selects.audioOutput,
    devices.filter((device) => device.kind === "audiooutput"),
    "Standard-Ausgabe",
    readStoredDeviceId(AUDIO_OUTPUT_DEVICE_STORAGE_KEY),
  );
  updateDeviceSelect(
    selects.videoInput,
    devices.filter((device) => device.kind === "videoinput"),
    "Standard-Kamera",
    readStoredDeviceId(VIDEO_INPUT_DEVICE_STORAGE_KEY),
  );
}

function updateDeviceSelect(
  select: HTMLSelectElement | null,
  devices: readonly MediaDeviceInfo[],
  defaultLabel: string,
  selectedDeviceId: string | null,
): void {
  if (!select) {
    return;
  }

  const selectedValue =
    selectedDeviceId && devices.some((device) => device.deviceId === selectedDeviceId)
      ? selectedDeviceId
      : "";
  select.replaceChildren(new Option(defaultLabel, ""));
  devices.forEach((device, index) => {
    const label = device.label || `${defaultLabel.replace("Standard-", "")} ${index + 1}`;
    select.add(new Option(label, device.deviceId));
  });
  select.value = selectedValue;
  select.disabled = devices.length <= 1;
  select.title =
    devices.length <= 1
      ? "Nur ein Geraet verfuegbar oder Browserfreigabe noch nicht erteilt"
      : "Geraet auswaehlen";
}

function setSelectUnavailable(select: HTMLSelectElement | null, label: string): void {
  if (!select) {
    return;
  }

  select.replaceChildren(new Option(label, ""));
  select.disabled = true;
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

function formatMicrophoneError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/denied|permission|notallowed/i.test(message)) {
    return "Mikrofonzugriff wurde blockiert. Bitte Browser-Berechtigung und Eingabegeraet pruefen.";
  }
  if (/notfound|device|devices|notreadable/i.test(message)) {
    return "Kein nutzbares Mikrofon gefunden. Bitte Eingabegeraet und Systemfreigabe pruefen.";
  }

  return `Mikrofon konnte nicht aktiviert werden: ${message}`;
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

export type VoiceShortcutAction = "deafen" | "mute" | "muteAndDeafen";

export function resolveVoiceShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "repeat">,
  target: EventTarget | null,
): VoiceShortcutAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || isTextEntryTarget(target)) {
    return null;
  }

  switch (event.key.toLowerCase()) {
    case "m":
      return "mute";
    case "d":
      return "deafen";
    case "b":
      return "muteAndDeafen";
    default:
      return null;
  }
}

export function mountVoiceControls(root: HTMLElement, client = new OpenVoiceVoiceClient()): void {
  root.insertAdjacentHTML("beforeend", renderVoiceControlsPanel());
  const audioInput = root.querySelector<HTMLSelectElement>("#voice-audio-input");
  const audioOutput = root.querySelector<HTMLSelectElement>("#voice-audio-output");
  const videoInput = root.querySelector<HTMLSelectElement>("#voice-video-input");
  const cameraQuality = root.querySelector<HTMLSelectElement>("#voice-camera-quality");
  const screenQuality = root.querySelector<HTMLSelectElement>("#voice-screen-quality");
  const screenMode = root.querySelector<HTMLSelectElement>("#voice-screen-mode");
  const status = root.querySelector<HTMLOutputElement>("#voice-status");
  const statsOutput = root.querySelector<HTMLElement>("#voice-connection-stats");
  const audioHost = root.querySelector<HTMLElement>("#voice-audio-host");
  const videoGrid = root.querySelector<HTMLElement>("#voice-video-grid");
  const participantStage = root.querySelector<HTMLElement>("#voice-participant-stage");
  const leaveButton = root.querySelector<HTMLButtonElement>("#voice-leave");
  const muteButton = root.querySelector<HTMLButtonElement>("#voice-mute");
  const deafenButton = root.querySelector<HTMLButtonElement>("#voice-deafen");
  const cameraButton = root.querySelector<HTMLButtonElement>("#voice-camera");
  const screenButton = root.querySelector<HTMLButtonElement>("#voice-screen");
  const mediaButtons = [leaveButton, muteButton, deafenButton, cameraButton, screenButton];
  const renderParticipants = (): void => {
    const participants = collectVoiceParticipants(
      client.liveKitRoom,
      client.currentState,
      client.currentParticipants,
    );
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
  if (audioHost) {
    mountRemoteAudio(audioHost, client.liveKitRoom, () => audioOutput?.value ?? "");
  }
  window.addEventListener("openvoice:voice-participants-refreshed", renderParticipants);
  void refreshMediaDeviceSelects({ audioInput, audioOutput, videoInput });
  if (typeof navigator !== "undefined") {
    navigator.mediaDevices?.addEventListener?.("devicechange", () => {
      void refreshMediaDeviceSelects({ audioInput, audioOutput, videoInput });
    });
  }
  const setStatus = (text: string): void => {
    if (status) {
      status.value = text;
    }
  };
  const refreshConnectionStats = (): void => {
    if (!statsOutput) {
      return;
    }

    if (!client.currentState) {
      statsOutput.textContent = "Nicht verbunden";
      return;
    }

    void client
      .collectQualitySample()
      .then((sample) => {
        statsOutput.textContent = formatConnectionStats(sample);
      })
      .catch(() => {
        statsOutput.textContent = "Stats nicht verfuegbar";
      });
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
    setAttachedRemoteAudioMuted(audioHost, Boolean(state?.selfDeafened));
    muteButton?.setAttribute(
      "aria-label",
      state?.selfMuted ? "Mikrofon einschalten" : "Mikrofon stummschalten",
    );
    deafenButton?.setAttribute(
      "aria-label",
      state?.selfDeafened ? "Audio einschalten" : "Audio ausschalten",
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
    dispatchAudioUnlock();
    if (!channelId) {
      setStatus("Channel fehlt");
      return;
    }
    if (joiningChannelId === channelId || client.currentState?.channelId === channelId) {
      return;
    }

    joiningChannelId = channelId;
    setVoiceActionsEnabled(false);
    let retryCount = 0;
    const attemptJoin = (): void => {
      setStatus(
        retryCount > 0 ? `${channelName} wird erneut verbunden.` : `${channelName} wird verbunden.`,
      );
      void client
        .leave()
        .catch(() => undefined)
        .then(() => client.join(channelId))
        .then((result) => {
          joiningChannelId = null;
          setVoiceActionsEnabled(true);
          setStatus(client.lastMicrophoneError ?? `Verbunden: ${result.roomName}`);
          updateControlStates();
          refreshConnectionStats();
          applyAttachedAudioSinkId(audioHost, audioOutput?.value ?? "");
          void refreshMediaDeviceSelects({ audioInput, audioOutput, videoInput });
          void client
            .refreshParticipants()
            .then(renderParticipants)
            .catch(() => undefined);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Voice join failed";
          if (retryCount < 1 && shouldRetryVoiceJoinError(message)) {
            retryCount += 1;
            setStatus("Voice-Verbindung wird erneut aufgebaut.");
            globalThis.setTimeout(attemptJoin, 1_200);
            return;
          }

          joiningChannelId = null;
          setVoiceActionsEnabled(false);
          setStatus(message);
          updateControlStates();
        });
    };

    attemptJoin();
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
    dispatchAudioUnlock();
    void client
      .leave()
      .then(() => {
        joiningChannelId = null;
        setVoiceActionsEnabled(false);
        setStatus("Getrennt");
        updateControlStates();
        refreshConnectionStats();
      })
      .catch((error: unknown) => {
        setVoiceActionsEnabled(false);
        setStatus(error instanceof Error ? error.message : "Voice leave failed");
      });
  });
  muteButton?.addEventListener("click", () => {
    dispatchAudioUnlock();
    const nextMuted = !client.currentState?.selfMuted;
    void client.setSelfMuted(nextMuted).then((state) => {
      setStatus(client.lastMicrophoneError ?? (state.selfMuted ? "Stumm" : "Mic an"));
      updateControlStates();
    });
  });
  const statsTimer = setInterval(refreshConnectionStats, 3_000);
  window.addEventListener(
    "beforeunload",
    () => {
      clearInterval(statsTimer);
    },
    { once: true },
  );
  audioInput?.addEventListener("change", () => {
    void client
      .setAudioInputDevice(audioInput.value)
      .then(() => setStatus(audioInput.value ? "Mikrofon gewechselt" : "Standard-Mikrofon aktiv"))
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Mikrofon konnte nicht gewechselt werden"),
      );
  });
  audioOutput?.addEventListener("change", () => {
    dispatchAudioUnlock();
    void client
      .setAudioOutputDevice(audioOutput.value)
      .then(() => {
        applyAttachedAudioSinkId(audioHost, audioOutput.value);
        setStatus(audioOutput.value ? "Ausgabegeraet gewechselt" : "Standard-Ausgabe aktiv");
      })
      .catch((error: unknown) =>
        setStatus(
          error instanceof Error ? error.message : "Ausgabegeraet konnte nicht gewechselt werden",
        ),
      );
  });
  videoInput?.addEventListener("change", () => {
    void client
      .setVideoInputDevice(videoInput.value)
      .then(() => setStatus(videoInput.value ? "Kamera gewechselt" : "Standard-Kamera aktiv"))
      .catch((error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Kamera konnte nicht gewechselt werden"),
      );
  });
  deafenButton?.addEventListener("click", () => {
    dispatchAudioUnlock();
    const nextDeafened = !client.currentState?.selfDeafened;
    void client.setSelfDeafened(nextDeafened).then((state) => {
      setStatus(state.selfDeafened ? "Taub" : "Audio an");
      updateControlStates();
    });
  });
  window.addEventListener("keydown", (event) => {
    const action = resolveVoiceShortcut(event, event.target);
    if (!action || !client.currentState) {
      return;
    }

    event.preventDefault();
    dispatchAudioUnlock();
    if (action === "mute") {
      const nextMuted = !client.currentState.selfMuted;
      void client.setSelfMuted(nextMuted).then((state) => {
        setStatus(client.lastMicrophoneError ?? (state.selfMuted ? "Stumm" : "Mic an"));
        updateControlStates();
      });
      return;
    }

    if (action === "deafen") {
      const nextDeafened = !client.currentState.selfDeafened;
      void client.setSelfDeafened(nextDeafened).then((state) => {
        setStatus(state.selfDeafened ? "Taub" : "Audio an");
        updateControlStates();
      });
      return;
    }

    const nextEnabled = !(client.currentState.selfMuted && client.currentState.selfDeafened);
    void client.setSelfMutedAndDeafened(nextEnabled).then((state) => {
      setStatus(state.selfMuted && state.selfDeafened ? "Stumm und taub" : "Mic und Audio an");
      updateControlStates();
    });
  });
  cameraButton?.addEventListener("click", () => {
    dispatchAudioUnlock();
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
    dispatchAudioUnlock();
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

export function shouldRetryVoiceJoinError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("pc connection") || normalized.includes("peerconnection");
}

export function toRtcIceServers(
  iceServers: VoiceJoinResponse["iceServers"],
): RTCIceServer[] {
  return iceServers.map((server) => ({
    ...(server.credential ? { credential: server.credential } : {}),
    urls: Array.from(server.urls),
    ...(server.username ? { username: server.username } : {}),
  }));
}

export function renderVoiceControlsPanel(): string {
  return `
      <section class="voice-panel" aria-label="Voice Stage">
        <header class="voice-panel__header">
          <div>
            <p class="eyebrow">Live Session</p>
            <h2>Voice, Kamera und Screen</h2>
          </div>
          <div class="voice-panel__header-status">
            <span class="voice-shortcuts" title="Shortcuts: M mute, D deafen, B beides">M / D / B</span>
            <output id="voice-status" class="voice-panel__status">Nicht verbunden</output>
          </div>
        </header>
        <div id="voice-audio-host" class="voice-audio-host" aria-hidden="true" hidden></div>
        <div id="voice-participant-stage" class="voice-participant-stage" aria-label="Teilnehmer"></div>
        <div id="voice-video-grid" class="voice-video-grid" aria-label="Video Grid"></div>
        <div class="voice-panel__actions" aria-label="Voice Aktionen">
          <button id="voice-mute" class="voice-control-button" type="button" disabled aria-label="Mikrofon stummschalten" title="Mikrofon stummschalten (M)">${controlIcon("mic")}</button>
          <button id="voice-deafen" class="voice-control-button" type="button" disabled aria-label="Audio ausschalten" title="Audio ausschalten (D)">${controlIcon("audio")}</button>
          <button id="voice-camera" class="voice-control-button" type="button" disabled aria-label="Kamera einschalten" title="Kamera">${controlIcon("camera")}</button>
          <button id="voice-screen" class="voice-control-button" type="button" disabled aria-label="Bildschirm teilen" title="Bildschirm teilen">${controlIcon("screen")}</button>
          <button id="voice-leave" class="voice-control-button voice-control-button--danger" type="button" disabled aria-label="Voice verlassen" title="Voice verlassen">${controlIcon("leave")}</button>
          <details class="voice-panel__settings">
            <summary aria-label="Media Einstellungen" title="Media Einstellungen">${controlIcon("settings")}</summary>
            <div class="voice-panel__media">
              <label class="voice-panel__field">
                <span>Mikrofon</span>
                <select id="voice-audio-input" class="voice-panel__input">
                  <option value="">Standard-Mikrofon</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Ausgabe</span>
                <select id="voice-audio-output" class="voice-panel__input">
                  <option value="">Standard-Ausgabe</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Kamera</span>
                <select id="voice-video-input" class="voice-panel__input">
                  <option value="">Standard-Kamera</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Audio-Codec</span>
                <select id="voice-audio-codec" class="voice-panel__input" disabled>
                  <option value="opus">Opus Auto</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Kamera-Qualitaet</span>
                <select id="voice-camera-quality" class="voice-panel__input">
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="1440p">1440p</option>
                  <option value="4k">4K</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Screen-Qualitaet</span>
                <select id="voice-screen-quality" class="voice-panel__input">
                  <option value="1080p">1080p</option>
                  <option value="1440p">1440p</option>
                  <option value="4k">4K</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <label class="voice-panel__field">
                <span>Screen-Modus</span>
                <select id="voice-screen-mode" class="voice-panel__input">
                  <option value="detail">Detail</option>
                  <option value="motion">Motion</option>
                </select>
              </label>
              <div class="voice-panel__stats" aria-live="polite">
                <span>Connection Stats</span>
                <output id="voice-connection-stats">Nicht verbunden</output>
              </div>
            </div>
          </details>
        </div>
      </section>
    `;
}

export function formatConnectionStats(sample: ClientRtcQualitySample): string {
  const audio = sample.audio;
  const video = sample.video;
  const rtt = formatNullableMetric(audio.rttMs, "ms");
  const jitter = formatNullableMetric(audio.jitterMs, "ms");
  const lost = audio.packetsLost ?? 0;
  const received = audio.packetsReceived ?? 0;
  const videoSize = video.width && video.height ? `${video.width}x${video.height}` : "kein Video";
  const fps = formatNullableMetric(video.framesPerSecond, "fps");

  return `ICE ${sample.connection.iceState} · ${sample.connection.selectedCandidateType}/${sample.connection.transport} · RTT ${rtt} · Jitter ${jitter} · Lost ${lost}/${received} · ${videoSize} ${fps}`;
}

function formatNullableMetric(value: number | null, unit: string): string {
  return value === null ? "-" : `${Math.round(value)} ${unit}`;
}

function controlIcon(name: "audio" | "camera" | "leave" | "mic" | "screen" | "settings"): string {
  const paths: Record<typeof name, string> = {
    audio:
      '<path d="M4 10v4h3l4 4V6l-4 4H4z"></path><path d="M15 9a4 4 0 0 1 0 6"></path><path d="M17 6a8 8 0 0 1 0 12"></path>',
    camera: '<path d="M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4z"></path><path d="M16 10l4-2v8l-4-2z"></path>',
    leave:
      '<path d="M6 14c3-3 9-3 12 0"></path><path d="M8 16l-2 3"></path><path d="M16 16l2 3"></path><path d="M10 13v4h4v-4"></path>',
    mic:
      '<path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path>',
    screen: '<rect x="4" y="5" width="16" height="11" rx="2"></rect><path d="M12 16v4"></path><path d="M8 20h8"></path>',
    settings:
      '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path><path d="M4 12h2"></path><path d="M18 12h2"></path><path d="M12 4v2"></path><path d="M12 18v2"></path>',
  };

  return `<svg class="voice-control-icon" aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
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

export function mountRemoteAudio(
  root: HTMLElement,
  room: Room,
  selectedOutputDeviceId: () => string,
): () => void {
  const render = (): void => {
    renderRemoteAudio(root, room, selectedOutputDeviceId());
  };

  room.on(RoomEvent.TrackSubscribed, render);
  room.on(RoomEvent.TrackUnsubscribed, render);
  room.on(RoomEvent.TrackPublished, render);
  room.on(RoomEvent.TrackUnpublished, render);
  room.on(RoomEvent.TrackMuted, render);
  room.on(RoomEvent.TrackUnmuted, render);
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
    room.off(RoomEvent.ParticipantConnected, render);
    room.off(RoomEvent.ParticipantDisconnected, render);
    clearAttachedRemoteAudio(root);
  };
}

export function renderRemoteAudio(root: HTMLElement, room: Room, outputDeviceId = ""): void {
  clearAttachedRemoteAudio(root);

  const fragment = document.createDocumentFragment();
  const attachedTracks: RemoteAudioTrack[] = [];
  const muted = root.dataset.remoteAudioMuted === "true";
  for (const track of collectRemoteAudioTracks(room)) {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.hidden = true;
    audio.muted = muted;
    audio.dataset.openvoiceRemoteAudio = "true";
    track.attach(audio);
    attachedTracks.push(track);
    setAudioElementSinkId(audio, outputDeviceId);
    void audio.play().catch(() => undefined);
    fragment.append(audio);
  }

  remoteAudioTracks.set(root, attachedTracks);
  root.replaceChildren(fragment);
}

export function collectRemoteAudioTracks(room: Room): RemoteAudioTrack[] {
  const tracks: RemoteAudioTrack[] = [];
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.audioTrackPublications.values()) {
      if (publication.audioTrack && !publication.isMuted) {
        tracks.push(publication.audioTrack as RemoteAudioTrack);
      }
    }
  }
  return tracks;
}

function setAttachedRemoteAudioMuted(root: HTMLElement | null, muted: boolean): void {
  if (!root) {
    return;
  }

  root.dataset.remoteAudioMuted = muted ? "true" : "false";
  root.querySelectorAll<HTMLAudioElement>("audio[data-openvoice-remote-audio]").forEach((audio) => {
    audio.muted = muted;
  });
}

function clearAttachedRemoteAudio(root: HTMLElement): void {
  const attachedTracks = remoteAudioTracks.get(root) ?? [];
  for (const track of attachedTracks) {
    track.detach();
  }
  remoteAudioTracks.delete(root);
  root.querySelectorAll<HTMLAudioElement>("audio[data-openvoice-remote-audio]").forEach((audio) => {
    audio.srcObject = null;
  });
}

function applyAttachedAudioSinkId(root: HTMLElement | null, outputDeviceId: string): void {
  root
    ?.querySelectorAll<HTMLAudioElement>("audio[data-openvoice-remote-audio]")
    .forEach((audio) => setAudioElementSinkId(audio, outputDeviceId));
}

function setAudioElementSinkId(audio: HTMLAudioElement, outputDeviceId: string): void {
  if (!("setSinkId" in audio)) {
    return;
  }

  void audio.setSinkId(outputDeviceId || "default").catch(() => undefined);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const element = target as Partial<HTMLElement>;
  if (element.isContentEditable) {
    return true;
  }

  const tagName = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  return tagName === "input" || tagName === "select" || tagName === "textarea";
}

export function renderVideoGrid(root: HTMLElement, room: Room): void {
  const focusedKey = root.dataset.focusedTrack;
  clearAttachedVideos(root);

  const tiles = collectVideoTiles(room);
  root.dataset.tileCount = String(tiles.length);
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
    if (focusedKey === tile.key || shouldFocusFirstTile(root, tile.key, tiles)) {
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

    const pin = document.createElement("span");
    pin.className = "voice-video-grid__pin";
    pin.textContent = focusedKey === tile.key ? "Pinned" : "Pin";

    element.append(video, caption, pin);
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
    <ol class="voice-participant-grid" data-participant-count="${participants.length}">
      ${participants.map(renderVoiceParticipantCard).join("")}
    </ol>
  `;
}

function shouldFocusFirstTile(root: HTMLElement, tileKey: string, tiles: readonly VideoTile[]): boolean {
  const stageMode = root.closest<HTMLElement>(".app-shell")?.dataset.stageMode;
  return stageMode === "focus" && !root.dataset.focusedTrack && tiles[0]?.key === tileKey;
}

export function collectVoiceParticipants(
  room: Room,
  state: VoiceState | null,
  serverParticipants: readonly VoiceParticipant[] = [],
): VoiceParticipantView[] {
  if (!state) {
    return [];
  }

  const storedDisplayName = readSessionDisplayName();
  const participants: VoiceParticipantView[] = [];
  const seenIdentities = new Set<string>();
  const remoteByIdentity = new Map<string, RemoteParticipant>();

  for (const participant of room.remoteParticipants.values()) {
    remoteByIdentity.set(participant.identity, participant);
  }

  const sourceParticipants =
    serverParticipants.length > 0
      ? serverParticipants
      : [
          {
            state,
            user: {
              displayName:
                room.localParticipant.name || storedDisplayName || `Du ${state.userId.slice(0, 8)}`,
              id: state.userId,
            },
          },
        ];

  for (const participant of sourceParticipants) {
    const participantState = participant.state;
    const remote = remoteByIdentity.get(participant.user.id);
    const isLocal = participant.user.id === state.userId;
    const identity = remote?.identity ?? participant.user.id;
    seenIdentities.add(identity);
    participants.push({
      cameraEnabled: Boolean(
        participantState.cameraEnabled || hasActiveVideo(remote, Track.Source.Camera),
      ),
      identity,
      isLocal,
      isSpeaking:
        Boolean(participantState.speaking) ||
        room.activeSpeakers.some((speaker) => speaker.identity === identity),
      name: isLocal
        ? room.localParticipant.name || storedDisplayName || participant.user.displayName
        : participant.user.displayName,
      screenShareEnabled: Boolean(
        participantState.screenShareEnabled || hasActiveVideo(remote, Track.Source.ScreenShare),
      ),
      selfDeafened: Boolean(participantState.selfDeafened || participantState.serverDeafened),
      selfMuted: Boolean(participantState.selfMuted || participantState.serverMuted),
      statusLabel: isLocal ? "Lokaler Teilnehmer" : "Remote Teilnehmer",
    });
  }

  for (const participant of room.remoteParticipants.values()) {
    if (seenIdentities.has(participant.identity)) {
      continue;
    }
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
      <span class="participant-role-chip">${participant.isLocal ? "Du" : "Verbunden"}</span>
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

function hasActiveVideo(participant: RemoteParticipant | undefined, source: Track.Source): boolean {
  if (!participant) {
    return false;
  }

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

function readStoredDeviceId(key: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  return localStorage.getItem(key);
}

function storeDeviceId(key: string, deviceId: string | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  if (deviceId) {
    localStorage.setItem(key, deviceId);
    return;
  }

  localStorage.removeItem(key);
}

function dispatchAudioUnlock(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("openvoice:unlock-audio"));
}

function authHeader(): Record<string, string> {
  if (typeof localStorage === "undefined") {
    return {};
  }

  const token = localStorage.getItem("openvoice.accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
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
      rttMs: null,
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
    rttMs: null,
    selectedCandidateType: IceCandidateType.UNKNOWN,
    transport: RtcTransportProtocol.UNKNOWN,
  };
}

function extractSelectedCandidate(
  report: RTCStatsReport,
): Pick<
  ClientRtcQualitySample["connection"],
  "rttMs" | "selectedCandidateType" | "transport"
> | null {
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
        readonly currentRoundTripTime?: unknown;
        readonly localCandidateId?: unknown;
        readonly selected?: unknown;
      };
      const localCandidateId = optionalString(pair.localCandidateId);
      const rttMs = secondsToMilliseconds(optionalNumber(pair.currentRoundTripTime));
      const candidatePair = {
        id: pair.id,
        rttMs,
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
    rttMs: selectedPair?.rttMs ?? null,
    selectedCandidateType: normalizeCandidateType(localCandidate.candidateType),
    transport: normalizeTransportProtocol(localCandidate),
  };
}

interface RtcCandidatePairStats {
  readonly id: string;
  readonly localCandidateId?: string;
  readonly rttMs: number | null;
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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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
