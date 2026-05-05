import { describe, expect, it } from "vitest";

import { ChannelType, MessageContentFormat, type ChannelTreeNode } from "@openvoice/shared";
import { renderChatPanel } from "../src/chat/chat-panel";
import { renderChannelTree } from "../src/channels/channel-tree";
import { formatWebTitle } from "../src/main";

describe("web foundation", () => {
  it("formats the phase title", () => {
    expect(formatWebTitle(4)).toBe("OpenVoice Phase 4");
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
});
