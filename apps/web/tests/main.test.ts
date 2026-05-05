import { describe, expect, it } from "vitest";

import {
  ChannelType,
  MessageContentFormat,
  VideoContentMode,
  VideoQualityProfile,
  type ChannelTreeNode,
} from "@openvoice/shared";
import { renderChatPanel } from "../src/chat/chat-panel";
import { renderChannelTree } from "../src/channels/channel-tree";
import { formatWebTitle } from "../src/main";
import {
  createCameraCaptureOptions,
  createScreenShareCaptureOptions,
  createScreenSharePublishOptions,
} from "../src/voice/media-profiles";

describe("web foundation", () => {
  it("formats the phase title", () => {
    expect(formatWebTitle(6)).toBe("OpenVoice Phase 6");
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
});
