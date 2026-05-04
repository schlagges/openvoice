export const ChannelType = {
  CATEGORY: "category",
  COMBINED: "combined",
  TEXT: "text",
  VOICE: "voice",
} as const;

export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const CHANNEL_TYPES = Object.values(ChannelType);

export const MAX_CHANNEL_DEPTH = 5;

export interface ChannelNode {
  readonly createdAt: string;
  readonly depth: number;
  readonly id: string;
  readonly inheritsPermissions: boolean;
  readonly isArchived: boolean;
  readonly name: string;
  readonly parentId: string | null;
  readonly path: string;
  readonly position: number;
  readonly slug: string;
  readonly type: ChannelType;
  readonly updatedAt: string;
  readonly workspaceId: string;
}

export interface ChannelTreeNode extends ChannelNode {
  readonly children: readonly ChannelTreeNode[];
}

export function isChannelType(value: unknown): value is ChannelType {
  return typeof value === "string" && CHANNEL_TYPES.includes(value as ChannelType);
}

export function canHaveChannelChildren(type: ChannelType): boolean {
  return type === ChannelType.CATEGORY;
}

export function isChannelDepthAllowed(depth: number): boolean {
  return Number.isInteger(depth) && depth >= 0 && depth <= MAX_CHANNEL_DEPTH;
}
