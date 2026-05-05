import {
  ServerGatewayEventType,
  type GatewayDispatchPayload,
  type MessageEvent,
  type MessageEventType,
  type ServerGatewayEventType as ServerEventType,
} from "@openvoice/shared";

import type { MessageEventPublisher } from "../messages/events.js";

export interface GatewayEvent {
  readonly channelId?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly payload: GatewayDispatchPayload;
  readonly type: ServerEventType;
  readonly workspaceId: string;
}

export interface PublishGatewayEventInput {
  readonly channelId?: string;
  readonly payload: GatewayDispatchPayload;
  readonly type: ServerEventType;
  readonly workspaceId: string;
}

export interface GatewayEventPublisher {
  publish(event: PublishGatewayEventInput): Promise<void>;
}

export interface GatewayEventPubSub extends GatewayEventPublisher {
  subscribe(handler: (event: GatewayEvent) => Promise<void> | void): () => void;
}

export class GatewayMessageEventPublisher implements MessageEventPublisher {
  private readonly gatewayEvents: GatewayEventPublisher;

  public constructor(gatewayEvents: GatewayEventPublisher) {
    this.gatewayEvents = gatewayEvents;
  }

  public async publish(event: MessageEvent): Promise<void> {
    await this.gatewayEvents.publish({
      channelId: event.channelId,
      payload: event.message,
      type: toGatewayMessageEventType(event.type),
      workspaceId: event.workspaceId,
    });
  }
}

export class CompositeMessageEventPublisher implements MessageEventPublisher {
  private readonly publishers: readonly MessageEventPublisher[];

  public constructor(publishers: readonly MessageEventPublisher[]) {
    this.publishers = publishers;
  }

  public async publish(event: MessageEvent): Promise<void> {
    await Promise.all(this.publishers.map((publisher) => publisher.publish(event)));
  }
}

function toGatewayMessageEventType(type: MessageEventType): ServerEventType {
  if (type === "MESSAGE_CREATE") {
    return ServerGatewayEventType.MESSAGE_CREATE;
  }

  if (type === "MESSAGE_UPDATE") {
    return ServerGatewayEventType.MESSAGE_UPDATE;
  }

  return ServerGatewayEventType.MESSAGE_DELETE;
}
