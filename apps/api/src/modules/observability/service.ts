import { Permission, type ClientRtcQualitySample } from "@openvoice/shared";

import { badRequest } from "../../http/errors.js";
import type { ChannelService } from "../channels/service.js";
import type { MediaProvider } from "../media/provider.js";
import { HealthService } from "./health.js";
import { OpenVoiceMetrics } from "./metrics.js";

export interface ObservabilityServiceOptions {
  readonly channelService: ChannelService;
  readonly healthService: HealthService;
  readonly mediaProvider?: MediaProvider;
  readonly metrics: OpenVoiceMetrics;
}

export class ObservabilityService {
  private readonly channelService: ChannelService;
  private readonly healthService: HealthService;
  private readonly mediaProvider: MediaProvider | null;
  public readonly metrics: OpenVoiceMetrics;

  public constructor(options: ObservabilityServiceOptions) {
    this.channelService = options.channelService;
    this.healthService = options.healthService;
    this.mediaProvider = options.mediaProvider ?? null;
    this.metrics = options.metrics;
  }

  public liveness() {
    return this.healthService.liveness();
  }

  public readiness() {
    return this.healthService.readiness();
  }

  public async metricsText(): Promise<string> {
    if (this.mediaProvider) {
      this.metrics.setMediaStats(
        await this.mediaProvider.getStats().catch(() => ({
          participantsActive: 0,
          roomsActive: 0,
        })),
      );
    }

    return this.metrics.toPrometheusText();
  }

  public async ingestRtcStats(input: {
    readonly sample: ClientRtcQualitySample;
    readonly userId: string;
  }): Promise<void> {
    if (input.sample.userId !== input.userId) {
      throw badRequest("RTC stats userId must match the authenticated user.");
    }

    const { channel } = await this.channelService.requireChannelPermission(
      input.sample.channelId,
      input.userId,
      Permission.VIEW_CHANNEL,
    );
    if (channel.workspaceId !== input.sample.workspaceId) {
      throw badRequest("RTC stats workspaceId does not match the channel.", {
        field: "workspaceId",
      });
    }

    this.metrics.recordRtcStats(input.sample);
  }
}
