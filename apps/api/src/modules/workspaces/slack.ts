import { forbidden } from "../../http/errors.js";

export interface SlackInviteMessage {
  readonly inviteUrl: string;
  readonly recipientEmail: string;
  readonly recipientName: string;
  readonly workspaceName: string;
}

export interface SlackInviteNotifier {
  sendInvite(input: SlackInviteMessage): Promise<void>;
}

export interface SlackWebApiInviteNotifierOptions {
  readonly botToken: string;
  readonly enabled: boolean;
}

interface SlackUserLookupResponse {
  readonly ok?: boolean;
  readonly error?: string;
  readonly user?: {
    readonly id?: string;
  };
}

interface SlackPostMessageResponse {
  readonly ok?: boolean;
  readonly error?: string;
}

export class SlackWebApiInviteNotifier implements SlackInviteNotifier {
  private readonly options: SlackWebApiInviteNotifierOptions;

  public constructor(options: SlackWebApiInviteNotifierOptions) {
    this.options = options;
  }

  public async sendInvite(input: SlackInviteMessage): Promise<void> {
    this.assertEnabled();
    const userId = await this.lookupUserIdByEmail(input.recipientEmail);
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      body: JSON.stringify({
        channel: userId,
        text: `${input.recipientName}, du wurdest zu ${input.workspaceName} in OpenVoice eingeladen: ${input.inviteUrl}`,
        unfurl_links: false,
        unfurl_media: false,
      }),
      headers: {
        authorization: `Bearer ${this.options.botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    const body = (await response.json()) as SlackPostMessageResponse;
    if (!response.ok || !body.ok) {
      throw forbidden(`Slack invite delivery failed: ${body.error ?? response.statusText}`);
    }
  }

  private async lookupUserIdByEmail(email: string): Promise<string> {
    const url = new URL("https://slack.com/api/users.lookupByEmail");
    url.searchParams.set("email", email);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${this.options.botToken}` },
    });
    const body = (await response.json()) as SlackUserLookupResponse;
    const userId = body.user?.id;
    if (!response.ok || !body.ok || !userId) {
      throw forbidden(`Slack user lookup failed: ${body.error ?? response.statusText}`);
    }

    return userId;
  }

  private assertEnabled(): void {
    if (!this.options.enabled || !this.options.botToken) {
      throw forbidden("Slack invite delivery is not configured.");
    }
  }
}
