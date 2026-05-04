import {
  type GatewayDispatchEnvelope,
  type MessageEvent,
  type MessageEventType,
} from "@openvoice/shared";

export interface MessageEventPublisher {
  publish(event: MessageEvent): Promise<void>;
}

export interface MessageEventSubscription {
  readonly canReceive: () => Promise<boolean>;
  readonly channelId: string;
  readonly send: (envelope: GatewayDispatchEnvelope<MessageEvent["message"]>) => void;
}

export class InMemoryMessageEventHub implements MessageEventPublisher {
  private readonly subscriptions = new Set<MessageEventSubscription>();

  public subscribe(subscription: MessageEventSubscription): () => void {
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  public async publish(event: MessageEvent): Promise<void> {
    await Promise.all(
      Array.from(this.subscriptions)
        .filter((subscription) => subscription.channelId === event.channelId)
        .map(async (subscription) => {
          if (await subscription.canReceive()) {
            subscription.send(toDispatchEnvelope(event.type, event.message));
          }
        }),
    );
  }
}

export function toDispatchEnvelope<T>(
  type: MessageEventType,
  payload: T,
): GatewayDispatchEnvelope<T> {
  return {
    d: payload,
    op: "DISPATCH",
    t: type,
  };
}
