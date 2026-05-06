import { type ClientRtcQualitySample } from "@openvoice/shared";

export interface MediaStatsSnapshot {
  readonly roomsActive: number;
  readonly participantsActive: number;
}

export class OpenVoiceMetrics {
  private readonly apiErrors = new Map<string, number>();
  private readonly httpRequests = new Map<string, number>();
  private gatewayConnections = 0;
  private readonly counters = new Map<string, number>([
    ["gateway_disconnects_total", 0],
    ["messages_sent_total", 0],
    ["permission_denied_total", 0],
    ["turn_credentials_issued_total", 0],
    ["voice_join_failures_total", 0],
    ["voice_joins_total", 0],
  ]);
  private sfuParticipantsActive = 0;
  private sfuRoomsActive = 0;
  private readonly rtcSamples = new SlidingRtcWindow(300);

  public recordHttpRequest(input: { readonly method: string; readonly status: number }): void {
    incrementMapCounter(
      this.httpRequests,
      `method=${input.method.toUpperCase()},status=${input.status}`,
    );
  }

  public recordApiError(input: { readonly code: string; readonly status: number }): void {
    incrementMapCounter(this.apiErrors, `code=${input.code},status=${input.status}`);
  }

  public recordGatewayConnectionCount(count: number): void {
    this.gatewayConnections = Math.max(0, count);
  }

  public recordGatewayDisconnect(): void {
    this.increment("gateway_disconnects_total");
  }

  public recordMessageSent(): void {
    this.increment("messages_sent_total");
  }

  public recordPermissionDenied(): void {
    this.increment("permission_denied_total");
  }

  public recordTurnCredentialsIssued(): void {
    this.increment("turn_credentials_issued_total");
  }

  public recordVoiceJoinSuccess(): void {
    this.increment("voice_joins_total");
  }

  public recordVoiceJoinFailure(): void {
    this.increment("voice_join_failures_total");
  }

  public recordRtcStats(sample: ClientRtcQualitySample): void {
    this.rtcSamples.add(sample);
  }

  public setMediaStats(stats: MediaStatsSnapshot): void {
    this.sfuRoomsActive = Math.max(0, stats.roomsActive);
    this.sfuParticipantsActive = Math.max(0, stats.participantsActive);
  }

  public toPrometheusText(): string {
    const rtc = this.rtcSamples.snapshot();
    const lines = [
      metricHelp("gateway_connections", "Active Gateway WebSocket connections."),
      metricType("gateway_connections", "gauge"),
      sample("gateway_connections", this.gatewayConnections),
      metricHelp("gateway_disconnects_total", "Gateway WebSocket disconnects."),
      metricType("gateway_disconnects_total", "counter"),
      sample("gateway_disconnects_total", this.getCounter("gateway_disconnects_total")),
      metricHelp("messages_sent_total", "Created non-duplicate chat messages."),
      metricType("messages_sent_total", "counter"),
      sample("messages_sent_total", this.getCounter("messages_sent_total")),
      metricHelp("voice_joins_total", "Successful voice joins."),
      metricType("voice_joins_total", "counter"),
      sample("voice_joins_total", this.getCounter("voice_joins_total")),
      metricHelp("voice_join_failures_total", "Failed voice join attempts."),
      metricType("voice_join_failures_total", "counter"),
      sample("voice_join_failures_total", this.getCounter("voice_join_failures_total")),
      metricHelp("permission_denied_total", "Denied permission checks observed by the API."),
      metricType("permission_denied_total", "counter"),
      sample("permission_denied_total", this.getCounter("permission_denied_total")),
      metricHelp("turn_credentials_issued_total", "TURN REST credential responses issued."),
      metricType("turn_credentials_issued_total", "counter"),
      sample("turn_credentials_issued_total", this.getCounter("turn_credentials_issued_total")),
      metricHelp("sfu_rooms_active", "Active SFU rooms reported by the media provider."),
      metricType("sfu_rooms_active", "gauge"),
      sample("sfu_rooms_active", this.sfuRoomsActive),
      metricHelp(
        "sfu_participants_active",
        "Active SFU participants reported by the media provider.",
      ),
      metricType("sfu_participants_active", "gauge"),
      sample("sfu_participants_active", this.sfuParticipantsActive),
      metricHelp("rtc_relay_ratio", "Ratio of recent RTC samples using relay candidates."),
      metricType("rtc_relay_ratio", "gauge"),
      sample("rtc_relay_ratio", rtc.relayRatio),
      metricHelp("rtc_packet_loss_avg", "Average recent RTC packet loss ratio."),
      metricType("rtc_packet_loss_avg", "gauge"),
      sample("rtc_packet_loss_avg", rtc.packetLossAvg),
      metricHelp("rtc_samples_total", "Recent RTC samples retained in the in-process window."),
      metricType("rtc_samples_total", "gauge"),
      sample("rtc_samples_total", rtc.sampleCount),
      metricHelp("rtc_audio_jitter_avg", "Average recent RTC audio jitter in milliseconds."),
      metricType("rtc_audio_jitter_avg", "gauge"),
      sample("rtc_audio_jitter_avg", rtc.audioJitterAvg),
      metricHelp(
        "rtc_audio_concealed_samples_avg",
        "Average recent RTC concealed audio samples.",
      ),
      metricType("rtc_audio_concealed_samples_avg", "gauge"),
      sample("rtc_audio_concealed_samples_avg", rtc.audioConcealedSamplesAvg),
      metricHelp("rtc_audio_rtt_p95", "P95 recent RTC audio RTT in milliseconds."),
      metricType("rtc_audio_rtt_p95", "gauge"),
      sample("rtc_audio_rtt_p95", rtc.audioRttP95),
      metricHelp("rtc_video_bitrate_avg", "Average recent RTC video bitrate in bps."),
      metricType("rtc_video_bitrate_avg", "gauge"),
      sample("rtc_video_bitrate_avg", rtc.videoBitrateAvg),
      metricHelp("api_http_requests_total", "API HTTP responses by method and status."),
      metricType("api_http_requests_total", "counter"),
      ...labeledSamples("api_http_requests_total", this.httpRequests),
      metricHelp("api_errors_total", "API errors by code and status."),
      metricType("api_errors_total", "counter"),
      ...labeledSamples("api_errors_total", this.apiErrors),
    ];

    return `${lines.join("\n")}\n`;
  }

  private increment(name: string): void {
    this.counters.set(name, this.getCounter(name) + 1);
  }

  private getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }
}

class SlidingRtcWindow {
  private readonly maxSamples: number;
  private readonly samples: ClientRtcQualitySample[] = [];

  public constructor(maxSamples: number) {
    this.maxSamples = maxSamples;
  }

  public add(sample: ClientRtcQualitySample): void {
    this.samples.push(sample);
    while (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  public snapshot(): {
    readonly audioRttP95: number;
    readonly audioConcealedSamplesAvg: number;
    readonly audioJitterAvg: number;
    readonly packetLossAvg: number;
    readonly relayRatio: number;
    readonly sampleCount: number;
    readonly videoBitrateAvg: number;
  } {
    if (this.samples.length === 0) {
      return {
        audioConcealedSamplesAvg: 0,
        audioJitterAvg: 0,
        audioRttP95: 0,
        packetLossAvg: 0,
        relayRatio: 0,
        sampleCount: 0,
        videoBitrateAvg: 0,
      };
    }

    const rtts = this.samples
      .map((item) => item.audio.rttMs ?? item.connection.rttMs)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);
    const jitters = this.samples
      .map((item) => item.audio.jitterMs)
      .filter((value): value is number => value !== null);
    const concealedSamples = this.samples
      .map((item) => item.audio.concealedSamples)
      .filter((value): value is number => value !== null);
    const packetLossRatios = this.samples.map((item) => {
      const total = item.audio.packetsLost + item.audio.packetsReceived + item.video.packetsLost;
      if (total <= 0) {
        return 0;
      }

      return (item.audio.packetsLost + item.video.packetsLost) / total;
    });
    const videoBitrates = this.samples
      .map((item) => item.video.bitrateBps)
      .filter((value): value is number => value !== null);

    return {
      audioConcealedSamplesAvg: average(concealedSamples),
      audioJitterAvg: average(jitters),
      audioRttP95: percentile(rtts, 0.95),
      packetLossAvg: average(packetLossRatios),
      relayRatio:
        this.samples.filter((item) => item.connection.selectedCandidateType === "relay").length /
        this.samples.length,
      sampleCount: this.samples.length,
      videoBitrateAvg: average(videoBitrates),
    };
  }
}

function incrementMapCounter(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function metricHelp(name: string, help: string): string {
  return `# HELP ${name} ${help}`;
}

function metricType(name: string, type: "counter" | "gauge"): string {
  return `# TYPE ${name} ${type}`;
}

function sample(name: string, value: number): string {
  return `${name} ${formatMetricNumber(value)}`;
}

function labeledSamples(name: string, values: ReadonlyMap<string, number>): string[] {
  return Array.from(values.entries()).map(([labels, value]) => {
    const formattedLabels = labels
      .split(",")
      .map((entry) => {
        const [label, rawValue] = entry.split("=");
        return `${label}="${escapeLabelValue(rawValue ?? "")}"`;
      })
      .join(",");
    return `${name}{${formattedLabels}} ${formatMetricNumber(value)}`;
  });
}

function formatMetricNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return String(value);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * quantile) - 1);
  return sortedValues[index] ?? 0;
}

function escapeLabelValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}
