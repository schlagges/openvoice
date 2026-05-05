import { randomUUID } from "node:crypto";

import {
  ChannelType,
  encodeMessageCursor,
  MessageContentFormat,
  MessageEventType,
  Permission,
  sanitizeMessageContent,
  type Message,
  type MessageContentFormat as ContentFormat,
} from "@openvoice/shared";

import type { ChannelNodeRecord, MessageCursorInput, MessageRecord } from "../../db/models.js";
import type { OpenVoiceRepository } from "../../db/repository.js";
import { badRequest, forbidden, notFound } from "../../http/errors.js";
import type { ChannelService } from "../channels/service.js";
import type { MessageEventPublisher } from "./events.js";
import { InMemoryRateLimiter, MESSAGE_RATE_LIMITS } from "./rate-limit.js";

export interface MessageServiceOptions {
  readonly channelService: ChannelService;
  readonly eventPublisher: MessageEventPublisher;
  readonly rateLimiter?: InMemoryRateLimiter;
  readonly repository: OpenVoiceRepository;
}

export interface CreateMessageCommand {
  readonly channelId: string;
  readonly clientMessageId: string;
  readonly content: string;
  readonly contentFormat: ContentFormat;
  readonly userId: string;
}

export interface ListMessagesCommand {
  readonly after?: MessageCursorInput;
  readonly before?: MessageCursorInput;
  readonly channelId: string;
  readonly limit: number;
  readonly userId: string;
}

export interface UpdateMessageCommand {
  readonly content: string;
  readonly contentFormat: ContentFormat;
  readonly messageId: string;
  readonly userId: string;
}

export interface DeleteMessageCommand {
  readonly messageId: string;
  readonly userId: string;
}

export interface CreateMessageResponse {
  readonly duplicate: boolean;
  readonly message: Message;
}

export interface ListMessagesResponse {
  readonly messages: readonly Message[];
  readonly pageInfo: {
    readonly nextBeforeCursor: string | null;
  };
}

export class MessageService {
  private readonly channelService: ChannelService;
  private readonly eventPublisher: MessageEventPublisher;
  private readonly rateLimiter: InMemoryRateLimiter;
  private readonly repository: OpenVoiceRepository;

  public constructor(options: MessageServiceOptions) {
    this.channelService = options.channelService;
    this.eventPublisher = options.eventPublisher;
    this.rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter();
    this.repository = options.repository;
  }

  public async createMessage(command: CreateMessageCommand): Promise<CreateMessageResponse> {
    this.rateLimiter.assertAllowed(
      `message:create:${command.userId}:${command.channelId}`,
      MESSAGE_RATE_LIMITS.create,
    );

    const { channel } = await this.requireChatPermission(
      command.channelId,
      command.userId,
      Permission.SEND_MESSAGES,
    );
    await this.channelService.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.VIEW_CHANNEL,
    );
    const sanitized = sanitizeMessageInput(command.content, command.contentFormat);
    const result = await this.repository.createMessage({
      authorId: command.userId,
      channelId: command.channelId,
      clientMessageId: command.clientMessageId,
      content: sanitized.content,
      contentFormat: sanitized.contentFormat,
      id: randomUUID(),
      workspaceId: channel.workspaceId,
    });
    const message = toPublicMessage(result.message);

    if (result.created) {
      await this.eventPublisher.publish({
        channelId: message.channelId,
        message,
        type: MessageEventType.CREATE,
        workspaceId: message.workspaceId,
      });
    }

    return {
      duplicate: !result.created,
      message,
    };
  }

  public async listMessages(command: ListMessagesCommand): Promise<ListMessagesResponse> {
    this.rateLimiter.assertAllowed(
      `message:history:${command.userId}:${command.channelId}`,
      MESSAGE_RATE_LIMITS.history,
    );
    await this.requireChatPermission(
      command.channelId,
      command.userId,
      Permission.READ_MESSAGE_HISTORY,
    );
    await this.channelService.requireChannelPermission(
      command.channelId,
      command.userId,
      Permission.VIEW_CHANNEL,
    );

    const rows = await this.repository.listMessages({
      ...(command.after ? { after: command.after } : {}),
      ...(command.before ? { before: command.before } : {}),
      channelId: command.channelId,
      limit: command.limit + 1,
    });
    const page = rows.slice(0, command.limit).map(toPublicMessage);
    const last = page.at(-1);

    return {
      messages: page,
      pageInfo: {
        nextBeforeCursor:
          rows.length > command.limit && last
            ? encodeMessageCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      },
    };
  }

  public async updateMessage(command: UpdateMessageCommand): Promise<Message> {
    const existing = await this.requireMessage(command.messageId);
    if (existing.deletedAt) {
      throw badRequest("Deleted messages cannot be edited.");
    }

    this.rateLimiter.assertAllowed(
      `message:edit:${command.userId}:${existing.channelId}`,
      MESSAGE_RATE_LIMITS.edit,
    );
    await this.requireChatPermission(
      existing.channelId,
      command.userId,
      Permission.EDIT_OWN_MESSAGES,
    );

    if (existing.authorId !== command.userId) {
      throw forbidden("Only the author can edit this message.");
    }

    const sanitized = sanitizeMessageInput(command.content, command.contentFormat);
    const updated = await this.repository.updateMessage({
      content: sanitized.content,
      contentFormat: sanitized.contentFormat,
      messageId: command.messageId,
    });
    const message = toPublicMessage(updated);
    await this.eventPublisher.publish({
      channelId: message.channelId,
      message,
      type: MessageEventType.UPDATE,
      workspaceId: message.workspaceId,
    });

    return message;
  }

  public async deleteMessage(command: DeleteMessageCommand): Promise<Message> {
    const existing = await this.requireMessage(command.messageId);
    await this.channelService.requireChannelPermission(
      existing.channelId,
      command.userId,
      Permission.VIEW_CHANNEL,
    );

    if (existing.deletedAt) {
      return toPublicMessage(existing);
    }

    this.rateLimiter.assertAllowed(
      `message:delete:${command.userId}:${existing.channelId}`,
      MESSAGE_RATE_LIMITS.delete,
    );

    if (existing.authorId === command.userId) {
      await this.channelService.requireChannelPermission(
        existing.channelId,
        command.userId,
        Permission.DELETE_OWN_MESSAGES,
      );
    } else {
      await this.channelService.requireChannelPermission(
        existing.channelId,
        command.userId,
        Permission.MANAGE_MESSAGES,
      );
    }

    const deleted = await this.repository.softDeleteMessage({
      actorId: command.userId,
      deletedBy: command.userId,
      messageId: command.messageId,
    });
    const message = toPublicMessage(deleted);
    await this.eventPublisher.publish({
      channelId: message.channelId,
      message,
      type: MessageEventType.DELETE,
      workspaceId: message.workspaceId,
    });

    return message;
  }

  public async canReceiveMessageEvents(channelId: string, userId: string): Promise<boolean> {
    try {
      await this.channelService.requireChannelPermission(
        channelId,
        userId,
        Permission.VIEW_CHANNEL,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async requireMessage(messageId: string): Promise<MessageRecord> {
    const message = await this.repository.findMessageById(messageId);
    if (!message) {
      throw notFound("Message not found.");
    }

    return message;
  }

  private async requireChatPermission(
    channelId: string,
    userId: string,
    permission: Permission,
  ): Promise<{ readonly channel: ChannelNodeRecord }> {
    const result = await this.channelService.requireChannelPermission(
      channelId,
      userId,
      permission,
    );
    assertChatChannel(result.channel);
    return { channel: result.channel };
  }
}

function sanitizeMessageInput(content: string, contentFormat: ContentFormat) {
  try {
    return sanitizeMessageContent(content, contentFormat);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : "Invalid message content.", {
      field: "content",
    });
  }
}

function assertChatChannel(channel: ChannelNodeRecord): void {
  if (channel.type !== ChannelType.TEXT && channel.type !== ChannelType.COMBINED) {
    throw badRequest("Messages are only supported in text and combined channels.", {
      channelType: channel.type,
    });
  }
}

export function toPublicMessage(message: MessageRecord): Message {
  const isDeleted = message.deletedAt !== null;

  return {
    authorId: message.authorId,
    channelId: message.channelId,
    clientMessageId: message.clientMessageId,
    content: isDeleted ? "" : message.content,
    contentFormat: isDeleted ? MessageContentFormat.PLAIN : message.contentFormat,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
    deletedBy: message.deletedBy,
    editedAt: message.editedAt?.toISOString() ?? null,
    id: message.id,
    updatedAt: message.updatedAt.toISOString(),
    workspaceId: message.workspaceId,
  };
}
