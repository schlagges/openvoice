import type { Message } from "@openvoice/shared";
import type { VoiceParticipantView } from "./voice/voice-client.js";

export type NotificationSound =
  | "camera-off"
  | "camera-on"
  | "message"
  | "mute"
  | "screen-off"
  | "screen-on"
  | "unmute";

export interface ParticipantSoundEvent {
  readonly identity: string;
  readonly name: string;
  readonly sound: NotificationSound;
}

interface ChatMessageEventDetail {
  readonly channelName: string;
  readonly isOwn: boolean;
  readonly message: Message;
}

interface ParticipantUpdateDetail {
  readonly participants: readonly VoiceParticipantView[];
}

interface NotificationEventDetail {
  readonly body: string;
  readonly sound: NotificationSound;
  readonly title: string;
}

type BrowserNotificationConstructor = typeof Notification;

interface AudioContextConstructor {
  new (): AudioContext;
}

interface WindowWithAudioFallback extends Window {
  readonly webkitAudioContext?: AudioContextConstructor;
}

let mounted = false;
let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let lastRemoteParticipants: Map<string, VoiceParticipantSnapshot> | null = null;

interface VoiceParticipantSnapshot {
  readonly cameraEnabled: boolean;
  readonly screenShareEnabled: boolean;
  readonly selfMuted: boolean;
}

export function mountBrowserNotifications(root: ParentNode = document): void {
  bindNotificationButton(root);
  if (mounted || typeof window === "undefined") {
    return;
  }

  mounted = true;
  window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
  window.addEventListener("keydown", unlockAudioOnce, { once: true });
  window.addEventListener("openvoice:unlock-audio", unlockAudioOnce);
  window.addEventListener("openvoice:chat-message-created", (event) => {
    const detail = (event as CustomEvent<ChatMessageEventDetail>).detail;
    if (!detail || !shouldNotifyMessage(detail.message, detail.isOwn)) {
      return;
    }

    const title = detail.channelName ? `Neue Nachricht in ${detail.channelName}` : "Neue Nachricht";
    const body = messageNotificationBody(detail.message);
    emitNotificationEvent({ body, sound: "message", title });
  });
  window.addEventListener("openvoice:participants-updated", (event) => {
    const detail = (event as CustomEvent<ParticipantUpdateDetail>).detail;
    const participantEvents = diffRemoteParticipantEvents(detail?.participants ?? []);
    for (const participantEvent of participantEvents) {
      emitNotificationEvent({
        body: participantEvent.name,
        sound: participantEvent.sound,
        title: participantEventTitle(participantEvent),
      });
    }
  });
  window.addEventListener("openvoice:notification-event", (event) => {
    const detail = (event as CustomEvent<NotificationEventDetail>).detail;
    if (!detail) {
      return;
    }

    playNotificationSound(detail.sound);
    showBrowserNotification(detail.title, detail.body);
  });
}

export function bindNotificationButton(root: ParentNode): void {
  const button = root.querySelector<HTMLButtonElement>("[data-notification-request]");
  if (!button) {
    return;
  }

  updateNotificationButton(button);
  button.addEventListener("click", () => {
    void requestBrowserNotificationPermission().then(() => updateNotificationButton(button));
  });
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  const NotificationApi = browserNotificationApi();
  if (!NotificationApi) {
    return "denied";
  }
  if (NotificationApi.permission !== "default") {
    return NotificationApi.permission;
  }

  return await NotificationApi.requestPermission();
}

export function diffRemoteParticipantEvents(
  participants: readonly VoiceParticipantView[],
): ParticipantSoundEvent[] {
  const next = new Map<string, VoiceParticipantSnapshot>();
  const events: ParticipantSoundEvent[] = [];

  for (const participant of participants) {
    if (participant.isLocal) {
      continue;
    }

    const snapshot = snapshotParticipant(participant);
    next.set(participant.identity, snapshot);
    const previous = lastRemoteParticipants?.get(participant.identity);
    if (!previous) {
      continue;
    }

    events.push(...participantStatusEvents(participant, previous, snapshot));
  }

  lastRemoteParticipants = next;
  return events;
}

export function resetNotificationStateForTests(): void {
  mounted = false;
  audioContext = null;
  audioUnlocked = false;
  lastRemoteParticipants = null;
}

export function shouldNotifyMessage(message: Message, isOwn: boolean): boolean {
  return !isOwn && !message.deletedAt;
}

function participantStatusEvents(
  participant: VoiceParticipantView,
  previous: VoiceParticipantSnapshot,
  next: VoiceParticipantSnapshot,
): ParticipantSoundEvent[] {
  const events: ParticipantSoundEvent[] = [];
  if (previous.selfMuted !== next.selfMuted) {
    events.push({
      identity: participant.identity,
      name: participant.name,
      sound: next.selfMuted ? "mute" : "unmute",
    });
  }
  if (previous.cameraEnabled !== next.cameraEnabled) {
    events.push({
      identity: participant.identity,
      name: participant.name,
      sound: next.cameraEnabled ? "camera-on" : "camera-off",
    });
  }
  if (previous.screenShareEnabled !== next.screenShareEnabled) {
    events.push({
      identity: participant.identity,
      name: participant.name,
      sound: next.screenShareEnabled ? "screen-on" : "screen-off",
    });
  }

  return events;
}

function snapshotParticipant(participant: VoiceParticipantView): VoiceParticipantSnapshot {
  return {
    cameraEnabled: participant.cameraEnabled,
    screenShareEnabled: participant.screenShareEnabled,
    selfMuted: participant.selfMuted,
  };
}

function emitNotificationEvent(detail: NotificationEventDetail): void {
  window.dispatchEvent(new CustomEvent("openvoice:notification-event", { detail }));
}

function participantEventTitle(event: ParticipantSoundEvent): string {
  switch (event.sound) {
    case "camera-on":
      return "Kamera eingeschaltet";
    case "camera-off":
      return "Kamera ausgeschaltet";
    case "screen-on":
      return "Bildschirmfreigabe gestartet";
    case "screen-off":
      return "Bildschirmfreigabe beendet";
    case "mute":
      return "Mikrofon stumm";
    case "unmute":
      return "Mikrofon aktiv";
    case "message":
      return "Neue Nachricht";
  }
}

function messageNotificationBody(message: Message): string {
  const content = message.content.trim();
  if (!content) {
    return "Neue Nachricht";
  }

  return content.length > 120 ? `${content.slice(0, 117)}...` : content;
}

function playNotificationSound(sound: NotificationSound): void {
  if (
    !audioUnlocked &&
    (typeof document === "undefined" || document.visibilityState !== "visible")
  ) {
    return;
  }

  const context = currentAudioContext();
  if (!context) {
    return;
  }
  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }

  const sequence = soundSequence(sound);
  let startAt = context.currentTime;
  for (const tone of sequence) {
    playTone(context, startAt, tone.frequency, tone.duration, tone.gain);
    startAt += tone.duration + 0.025;
  }
}

function unlockAudioOnce(): void {
  audioUnlocked = true;
  void currentAudioContext()?.resume().catch(() => undefined);
}

function currentAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextApi =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ?? (window as WindowWithAudioFallback).webkitAudioContext;
  if (!AudioContextApi) {
    return null;
  }

  audioContext = new AudioContextApi();
  return audioContext;
}

function playTone(
  context: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  gainValue: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.015);
}

function soundSequence(sound: NotificationSound): readonly {
  readonly duration: number;
  readonly frequency: number;
  readonly gain: number;
}[] {
  switch (sound) {
    case "message":
      return [
        { duration: 0.07, frequency: 740, gain: 0.045 },
        { duration: 0.09, frequency: 980, gain: 0.035 },
      ];
    case "camera-on":
      return [{ duration: 0.12, frequency: 660, gain: 0.035 }];
    case "camera-off":
      return [{ duration: 0.11, frequency: 440, gain: 0.03 }];
    case "screen-on":
      return [
        { duration: 0.08, frequency: 520, gain: 0.035 },
        { duration: 0.12, frequency: 780, gain: 0.035 },
      ];
    case "screen-off":
      return [{ duration: 0.13, frequency: 390, gain: 0.03 }];
    case "mute":
      return [{ duration: 0.09, frequency: 310, gain: 0.032 }];
    case "unmute":
      return [{ duration: 0.09, frequency: 620, gain: 0.032 }];
  }
}

function showBrowserNotification(title: string, body: string): void {
  const NotificationApi = browserNotificationApi();
  if (!NotificationApi || NotificationApi.permission !== "granted" || !document.hidden) {
    return;
  }

  new NotificationApi(title, {
    body,
    icon: "/favicon.svg",
    tag: "openvoice-chat",
  });
}

function updateNotificationButton(button: HTMLButtonElement): void {
  const NotificationApi = browserNotificationApi();
  if (!NotificationApi) {
    button.hidden = true;
    return;
  }

  button.hidden = false;
  button.disabled = NotificationApi.permission === "denied";
  button.textContent = notificationButtonText(NotificationApi.permission);
  button.title =
    NotificationApi.permission === "granted"
      ? "Browserbenachrichtigungen sind aktiv"
      : "Browserbenachrichtigungen aktivieren";
}

function notificationButtonText(permission: NotificationPermission): string {
  switch (permission) {
    case "granted":
      return "Benachrichtigungen aktiv";
    case "denied":
      return "Benachrichtigungen blockiert";
    case "default":
      return "Benachrichtigungen";
  }
}

function browserNotificationApi(): BrowserNotificationConstructor | null {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  return window.Notification;
}
