import { describe, expect, it } from "vitest";

import {
  buildChannelTree,
  canHaveChannelChildren,
  ChannelType,
  isChannelDepthAllowed,
  isChannelType,
  MAX_CHANNEL_DEPTH,
  type ChannelNode,
} from "../src/index.js";

describe("channel shared types", () => {
  it("validates channel types and child-capable channel kinds", () => {
    expect(isChannelType("category")).toBe(true);
    expect(isChannelType("text")).toBe(true);
    expect(isChannelType("forum")).toBe(false);
    expect(canHaveChannelChildren(ChannelType.CATEGORY)).toBe(true);
    expect(canHaveChannelChildren(ChannelType.TEXT)).toBe(false);
  });

  it("bounds channel depth", () => {
    expect(isChannelDepthAllowed(0)).toBe(true);
    expect(isChannelDepthAllowed(MAX_CHANNEL_DEPTH)).toBe(true);
    expect(isChannelDepthAllowed(MAX_CHANNEL_DEPTH + 1)).toBe(false);
  });

  it("builds a sorted tree from flat visible nodes", () => {
    const now = new Date().toISOString();
    const nodes: ChannelNode[] = [
      makeNode({
        id: "text",
        name: "Text",
        parentId: "category",
        position: 1,
        type: ChannelType.TEXT,
        now,
      }),
      makeNode({
        id: "category",
        name: "Category",
        parentId: null,
        position: 2,
        type: ChannelType.CATEGORY,
        now,
      }),
      makeNode({
        id: "voice",
        name: "Voice",
        parentId: null,
        position: 1,
        type: ChannelType.VOICE,
        now,
      }),
    ];

    expect(
      buildChannelTree(nodes).map((node) => [node.name, node.children.map((child) => child.name)]),
    ).toEqual([
      ["Voice", []],
      ["Category", ["Text"]],
    ]);
  });
});

function makeNode(input: {
  readonly id: string;
  readonly name: string;
  readonly now: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly type: ChannelType;
}): ChannelNode {
  return {
    createdAt: input.now,
    depth: input.parentId ? 1 : 0,
    id: input.id,
    inheritsPermissions: true,
    isArchived: false,
    name: input.name,
    parentId: input.parentId,
    path: input.parentId ? `${input.parentId}.${input.id}` : input.id,
    position: input.position,
    slug: input.name.toLowerCase(),
    type: input.type,
    updatedAt: input.now,
    workspaceId: "workspace",
  };
}
