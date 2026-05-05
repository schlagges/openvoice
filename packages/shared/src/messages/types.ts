export const MessageContentFormat = {
  MARKDOWN: "markdown",
  PLAIN: "plain",
} as const;

export type MessageContentFormat = (typeof MessageContentFormat)[keyof typeof MessageContentFormat];

export const MESSAGE_CONTENT_FORMATS = Object.values(MessageContentFormat);

export interface Message {
  readonly authorId: string;
  readonly channelId: string;
  readonly clientMessageId: string;
  readonly content: string;
  readonly contentFormat: MessageContentFormat;
  readonly createdAt: string;
  readonly deletedAt: string | null;
  readonly deletedBy: string | null;
  readonly editedAt: string | null;
  readonly id: string;
  readonly updatedAt: string;
  readonly workspaceId: string;
}

export const MessageEventType = {
  CREATE: "MESSAGE_CREATE",
  DELETE: "MESSAGE_DELETE",
  UPDATE: "MESSAGE_UPDATE",
} as const;

export type MessageEventType = (typeof MessageEventType)[keyof typeof MessageEventType];

export interface MessageEvent {
  readonly channelId: string;
  readonly message: Message;
  readonly type: MessageEventType;
  readonly workspaceId: string;
}

export interface GatewayDispatchEnvelope<T> {
  readonly d: T;
  readonly op: "DISPATCH";
  readonly t: string;
}

export function isMessageContentFormat(value: unknown): value is MessageContentFormat {
  return (
    typeof value === "string" && MESSAGE_CONTENT_FORMATS.includes(value as MessageContentFormat)
  );
}
