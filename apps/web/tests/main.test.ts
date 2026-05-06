import { describe, expect, it, vi } from "vitest";
import type { Room } from "livekit-client";

import {
  AudioMode,
  ChannelType,
  MessageContentFormat,
  VideoContentMode,
  VideoQualityProfile,
  type ClientRtcQualitySample,
  type ChannelTreeNode,
  type VoiceParticipant,
  type VoiceState,
} from "@openvoice/shared";
import {
  reconnectDelayMs,
  rememberChatAuthor,
  renderChatPanel,
  renderMessage,
} from "../src/chat/chat-panel";
import { renderChannelTree } from "../src/channels/channel-tree";
import {
  formatWebTitle,
  renderDesktopQrPanel,
  renderInviteDialog,
  renderOnboardingDialog,
  renderOperationsLinks,
  renderWorkspaceSwitcher,
} from "../src/main";
import { renderAuditLog } from "../src/moderation/audit-log";
import {
  diffRemoteParticipantEvents,
  resetNotificationStateForTests,
  shouldNotifyMessage,
} from "../src/notifications";
import {
  createCameraCaptureOptions,
  createScreenShareCaptureOptions,
  createScreenSharePublishOptions,
} from "../src/voice/media-profiles";
import {
  collectVoiceParticipants,
  collectVideoTiles,
  formatVoiceRequestError,
  OpenVoiceVoiceClient,
  renderVoiceControlsPanel,
  shouldRetryVoiceJoinError,
  toRtcIceServers,
  toRtcStatsRequestBody,
  type VoiceParticipantView,
} from "../src/voice/voice-client";

describe("web foundation", () => {
  it("formats the phase title", () => {
    expect(formatWebTitle(9)).toBe("OpenVoice Phase 9");
  });

  it("renders local operations links", () => {
    const html = renderOperationsLinks();

    expect(html).toContain("/healthz");
    expect(html).toContain("/readyz");
    expect(html).toContain("/metrics");
    expect(html).toContain("http://localhost:9090");
    expect(html).toContain("http://localhost:3001");
  });

  it("renders a desktop QR panel for mobile handoff", () => {
    const html = renderDesktopQrPanel("https://voice.schnick-schnack.info/test");

    expect(html).toContain("Mobile öffnen");
    expect(html).toContain("<svg");
    expect(html).toContain("https://voice.schnick-schnack.info/test");
  });

  it("renders visible workspaces with active state", () => {
    const html = renderWorkspaceSwitcher(
      [
        {
          accessMode: "global_authenticated",
          id: "workspace-1",
          memberCount: 3,
          name: "Team Voice",
          ownerId: "owner-user-id",
        },
      ],
      "workspace-1",
    );

    expect(html).toContain("Team Voice");
    expect(html).toContain("is-active");
    expect(html).toContain("Ebene 1: Server und Mitglieder");
    expect(html).toContain("3 Mitglieder");
    expect(html).toContain("Global");
    expect(html).toContain("Keycloak-Workspace");
    expect(html).not.toContain("Invite erstellen");
  });

  it("renders the empty workspace start card as the primary entry point", () => {
    const html = renderWorkspaceSwitcher([], "");

    expect(html).toContain("Noch kein Workspace");
    expect(html).toContain("Workspace erstellen");
    expect(html).toContain("Workspace beitreten");
    expect(html).toContain(">Neu<");
    expect(html.match(/Workspace starten/g)).toBeNull();
  });

  it("renders a focused onboarding flow without invite creation", () => {
    const html = renderOnboardingDialog();

    expect(html).toContain("Workspace starten");
    expect(html).toContain("Workspace erstellen");
    expect(html).toContain("Workspace beitreten");
    expect(html).toContain("Channel-Typ");
    expect(html).toContain("Chat + Voice");
    expect(html).toContain("Privater Raum");
    expect(html).toContain("Windfang");
    expect(html).toContain('value="combined"');
    expect(html).toMatch(/value="(?:BoToLu|BoLuTo|ToBoLu|ToLuBo|LuBoTo|LuToBo)#[0-9]{4}"/);
    expect(html).toContain("Erweiterte Testdaten");
    expect(html).toContain('id="onboarding-dialog"');
    expect(html).not.toContain("Invite-Code erstellen");
  });

  it("renders invite creation as a workspace action", () => {
    const html = renderInviteDialog();

    expect(html).toContain("Personen einladen");
    expect(html).toContain("Invite-Code erstellen");
    expect(html).toContain('id="invite-dialog"');
  });

  it("renders voice controls without a separate join button", () => {
    const html = renderVoiceControlsPanel();

    expect(html).not.toContain("Voice beitreten");
    expect(html).not.toContain("voice-channel-id");
    expect(html).toContain('aria-label="Kamera einschalten"');
    expect(html).toContain('id="voice-camera"');
    expect(html).toContain('type="button" disabled aria-label="Kamera einschalten"');
    expect(html).toContain("Media Einstellungen");
    expect(html).toContain("Nicht verbunden");
  });

  it("unlocks LiveKit audio playback after joining voice", async () => {
    const state = createVoiceState("workspace", "channel", "user-local");
    const startAudio = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const setMicrophoneEnabled = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const room = {
      connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      localParticipant: {
        setMicrophoneEnabled,
      },
      off: vi.fn(),
      on: vi.fn(),
      startAudio,
    } as unknown as Room;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        iceServers: [
          { urls: ["stun:voice.example:3478"] },
          {
            credential: "turn-credential",
            urls: ["turn:voice.example:3478?transport=udp"],
            username: "turn-user",
          },
        ],
        livekitUrl: "wss://voice.example/livekit",
        permissions: {
          canPublishAudio: true,
          canPublishCamera: true,
          canPublishScreen: true,
          canPublishScreen4k: false,
        },
        roomName: "openvoice_workspace_channel",
        state,
        token: "token",
      }),
    ) as unknown as typeof fetch;

    try {
      await new OpenVoiceVoiceClient({ apiBaseUrl: "/api/v1", room }).join("channel");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(startAudio).toHaveBeenCalledTimes(1);
    expect(room.connect).toHaveBeenCalledWith("wss://voice.example/livekit", "token", {
      autoSubscribe: true,
      peerConnectionTimeout: 25_000,
      rtcConfig: {
        iceServers: [
          { urls: ["stun:voice.example:3478"] },
          {
            credential: "turn-credential",
            urls: ["turn:voice.example:3478?transport=udp"],
            username: "turn-user",
          },
        ],
      },
    });
    expect(setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it("maps OpenVoice ICE servers to browser RTCConfiguration servers", () => {
    expect(
      toRtcIceServers([
        { urls: ["stun:voice.example:3478"] },
        {
          credential: "credential",
          urls: ["turn:voice.example:3478?transport=tcp"],
          username: "user",
        },
      ]),
    ).toEqual([
      { urls: ["stun:voice.example:3478"] },
      {
        credential: "credential",
        urls: ["turn:voice.example:3478?transport=tcp"],
        username: "user",
      },
    ]);
  });

  it("retries transient LiveKit peer connection failures", () => {
    expect(shouldRetryVoiceJoinError("could not establish pc connection")).toBe(true);
    expect(shouldRetryVoiceJoinError("failed to establish PeerConnection")).toBe(true);
    expect(shouldRetryVoiceJoinError("Missing required workspace permission")).toBe(false);
  });

  it("renders server-side voice participants even before LiveKit exposes remotes", () => {
    const state = createVoiceState("workspace", "channel", "user-local");
    const participants: VoiceParticipant[] = [
      {
        state,
        user: { displayName: "Boris Backes", id: "user-local" },
      },
      {
        state: createVoiceState("workspace", "channel", "user-remote"),
        user: { displayName: "Hans Dampf", id: "user-remote" },
      },
    ];
    const room = {
      activeSpeakers: [],
      localParticipant: {
        identity: "user-local",
        name: "",
      },
      remoteParticipants: new Map(),
    } as unknown as Room;

    expect(
      collectVoiceParticipants(room, state, participants).map((participant) => participant.name),
    ).toEqual(["Boris Backes", "Hans Dampf"]);
  });

  it("renders an escaped channel tree", () => {
    const now = new Date().toISOString();
    const channels: ChannelTreeNode[] = [
      {
        children: [
          {
            children: [],
            createdAt: now,
            depth: 1,
            id: "text",
            inheritsPermissions: true,
            isArchived: false,
            name: "<general>",
            parentId: "category",
            path: "category.text",
            position: 0,
            slug: "general",
            type: ChannelType.TEXT,
            updatedAt: now,
            workspaceId: "workspace",
          },
        ],
        createdAt: now,
        depth: 0,
        id: "category",
        inheritsPermissions: true,
        isArchived: false,
        name: "Root",
        parentId: null,
        path: "category",
        position: 0,
        slug: "root",
        type: ChannelType.CATEGORY,
        updatedAt: now,
        workspaceId: "workspace",
      },
    ];

    expect(renderChannelTree(channels)).toContain("&lt;general&gt;");
    expect(renderChannelTree(channels)).toContain('type="button"');
  });

  it("renders escaped chat messages", () => {
    const now = new Date().toISOString();
    const html = renderChatPanel([
      {
        authorId: "author",
        channelId: "channel",
        clientMessageId: "client",
        content: "<script>alert(1)</script>",
        contentFormat: MessageContentFormat.MARKDOWN,
        createdAt: now,
        deletedAt: null,
        deletedBy: null,
        editedAt: now,
        id: "message",
        updatedAt: now,
        workspaceId: "workspace",
      },
    ]);

    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("bearbeitet");
    expect(html).toContain("Benachrichtigungen");
  });

  it("does not notify for own or deleted messages", () => {
    const now = new Date().toISOString();
    const message = {
      authorId: "author",
      channelId: "channel",
      clientMessageId: "client",
      content: "Hallo",
      contentFormat: MessageContentFormat.MARKDOWN,
      createdAt: now,
      deletedAt: null,
      deletedBy: null,
      editedAt: null,
      id: "message",
      updatedAt: now,
      workspaceId: "workspace",
    };

    expect(shouldNotifyMessage(message, false)).toBe(true);
    expect(shouldNotifyMessage(message, true)).toBe(false);
    expect(shouldNotifyMessage({ ...message, deletedAt: now }, false)).toBe(false);
  });

  it("creates sounds for remote participant media state changes", () => {
    resetNotificationStateForTests();

    expect(
      diffRemoteParticipantEvents([
        createParticipant({ identity: "remote", name: "Remote", selfMuted: false }),
      ]),
    ).toEqual([]);
    expect(
      diffRemoteParticipantEvents([
        createParticipant({
          cameraEnabled: true,
          identity: "remote",
          name: "Remote",
          screenShareEnabled: true,
          selfMuted: true,
        }),
      ]),
    ).toEqual([
      { identity: "remote", name: "Remote", sound: "mute" },
      { identity: "remote", name: "Remote", sound: "camera-on" },
      { identity: "remote", name: "Remote", sound: "screen-on" },
    ]);
    expect(
      diffRemoteParticipantEvents([
        createParticipant({
          cameraEnabled: true,
          identity: "local",
          isLocal: true,
          name: "Du",
          selfMuted: true,
        }),
      ]),
    ).toEqual([]);
  });

  it("renders chat author display names from the UI cache", () => {
    const now = new Date().toISOString();
    rememberChatAuthor("author-keycloak-id", "Boris Backes");

    expect(
      renderMessage({
        authorId: "author-keycloak-id",
        channelId: "channel",
        clientMessageId: "client",
        content: "Hallo",
        contentFormat: MessageContentFormat.MARKDOWN,
        createdAt: now,
        deletedAt: null,
        deletedBy: null,
        editedAt: null,
        id: "message",
        updatedAt: now,
        workspaceId: "workspace",
      }),
    ).toContain("Boris Backes");
  });

  it("renders chat messages chronologically", () => {
    const old = "2026-05-06T08:00:00.000Z";
    const newer = "2026-05-06T08:01:00.000Z";
    const html = renderChatPanel([
      {
        authorId: "author",
        channelId: "channel",
        clientMessageId: "newer",
        content: "newer",
        contentFormat: MessageContentFormat.MARKDOWN,
        createdAt: newer,
        deletedAt: null,
        deletedBy: null,
        editedAt: null,
        id: "message-newer",
        updatedAt: newer,
        workspaceId: "workspace",
      },
      {
        authorId: "author",
        channelId: "channel",
        clientMessageId: "old",
        content: "old",
        contentFormat: MessageContentFormat.MARKDOWN,
        createdAt: old,
        deletedAt: null,
        deletedBy: null,
        editedAt: null,
        id: "message-old",
        updatedAt: old,
        workspaceId: "workspace",
      },
    ]);

    expect(html.indexOf("old")).toBeLessThan(html.indexOf("newer"));
  });

  it("renders an actionable chat empty state", () => {
    const html = renderChatPanel([]);

    expect(html).toContain("Noch keine Nachrichten");
    expect(html).toContain("Nachricht senden");
    expect(html).toContain("chat-composer-status");
  });

  it("caps chat websocket reconnect backoff", () => {
    expect(reconnectDelayMs(0)).toBe(1_000);
    expect(reconnectDelayMs(2)).toBe(4_000);
    expect(reconnectDelayMs(20)).toBe(10_000);
  });

  it("exports escaped message rendering for dynamic appends", () => {
    const now = new Date().toISOString();

    expect(
      renderMessage({
        authorId: "author",
        channelId: "channel",
        clientMessageId: "client",
        content: "<b>hello</b>",
        contentFormat: MessageContentFormat.MARKDOWN,
        createdAt: now,
        deletedAt: null,
        deletedBy: null,
        editedAt: null,
        id: "message",
        updatedAt: now,
        workspaceId: "workspace",
      }),
    ).toContain("&lt;b&gt;hello&lt;/b&gt;");
  });

  it("renders escaped audit log entries", () => {
    const now = new Date().toISOString();
    const html = renderAuditLog([
      {
        actorId: "actor<script>",
        createdAt: now,
        event: "MEMBER_BAN<script>",
        id: "audit",
        ipHash: null,
        metadata: {},
        reason: "<reason>",
        targetId: "target",
        targetType: "workspace_member",
        workspaceId: "workspace",
      },
    ]);

    expect(html).toContain("MEMBER_BAN&lt;script&gt;");
    expect(html).toContain("&lt;reason&gt;");
  });

  it("builds camera and screenshare media profiles", () => {
    expect(createCameraCaptureOptions(VideoQualityProfile.P720).resolution).toMatchObject({
      frameRate: 30,
      height: 720,
      width: 1280,
    });

    expect(
      createScreenShareCaptureOptions(VideoQualityProfile.P4K, VideoContentMode.DETAIL),
    ).toMatchObject({
      contentHint: "detail",
      resolution: {
        frameRate: 30,
        height: 2160,
        width: 3840,
      },
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: "include",
    });

    expect(
      createScreenSharePublishOptions(VideoQualityProfile.P4K, VideoContentMode.DETAIL),
    ).toMatchObject({
      degradationPreference: "maintain-resolution",
      simulcast: true,
    });
  });

  it("omits user identity from RTC stats upload payloads", () => {
    const sample: ClientRtcQualitySample = {
      audio: {
        bitrateBps: null,
        concealedSamples: null,
        jitterMs: 5,
        packetsLost: 1,
        packetsReceived: 100,
        rttMs: 30,
      },
      channelId: "channel",
      connection: {
        iceState: "connected",
        selectedCandidateType: "relay",
        transport: "udp",
      },
      sessionId: "session",
      timestamp: new Date(0).toISOString(),
      userId: "user",
      video: {
        bitrateBps: 250_000,
        framesDropped: null,
        framesPerSecond: 30,
        height: 720,
        packetsLost: 0,
        width: 1280,
      },
      workspaceId: "workspace",
    };

    expect(toRtcStatsRequestBody(sample)).not.toHaveProperty("userId");
    expect(toRtcStatsRequestBody(sample)).toMatchObject({
      channelId: "channel",
      connection: { selectedCandidateType: "relay" },
    });
  });

  it("formats actionable voice request errors", async () => {
    await expect(formatVoiceRequestError(new Response(null, { status: 401 }))).resolves.toContain(
      "Nicht angemeldet",
    );
    await expect(formatVoiceRequestError(new Response(null, { status: 403 }))).resolves.toContain(
      "Kein Zugriff",
    );
    await expect(formatVoiceRequestError(new Response(null, { status: 500 }))).resolves.toBe(
      "OpenVoice voice request failed with 500.",
    );
    await expect(
      formatVoiceRequestError(
        Response.json({ error: { message: "Invalid CSRF token." } }, { status: 403 }),
      ),
    ).resolves.toContain("CSRF");
  });

  it("omits muted video publications from the RTC video grid model", () => {
    const activeTrack = { attach: () => undefined, detach: () => undefined };
    const mutedTrack = { attach: () => undefined, detach: () => undefined };
    const room = {
      localParticipant: {
        videoTrackPublications: new Map([
          [
            "active",
            { isMuted: false, source: "camera", trackSid: "active", videoTrack: activeTrack },
          ],
          ["muted", { isMuted: true, source: "camera", trackSid: "muted", videoTrack: mutedTrack }],
        ]),
      },
      remoteParticipants: new Map(),
    } as unknown as Room;

    expect(collectVideoTiles(room)).toHaveLength(1);
    expect(collectVideoTiles(room)[0]?.key).toBe("local:active");
  });
});

function createVoiceState(workspaceId: string, channelId: string, userId: string): VoiceState {
  return {
    audioMode: AudioMode.VOICE,
    cameraEnabled: false,
    cameraQuality: VideoQualityProfile.P720,
    channelId,
    connectedAt: new Date(0).toISOString(),
    screenShareContentMode: VideoContentMode.DETAIL,
    screenShareEnabled: false,
    screenShareQuality: VideoQualityProfile.P1080,
    selfDeafened: false,
    selfMuted: false,
    serverDeafened: false,
    serverMuted: false,
    sessionId: "session",
    speaking: false,
    updatedAt: new Date(0).toISOString(),
    userId,
    workspaceId,
  };
}

function createParticipant(
  overrides: Partial<VoiceParticipantView> & Pick<VoiceParticipantView, "identity" | "name">,
): VoiceParticipantView {
  return {
    cameraEnabled: false,
    isLocal: false,
    isSpeaking: false,
    screenShareEnabled: false,
    selfDeafened: false,
    selfMuted: false,
    statusLabel: "Remote Teilnehmer",
    ...overrides,
  };
}
