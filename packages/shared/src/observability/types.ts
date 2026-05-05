export const IceCandidateType = {
  HOST: "host",
  RELAY: "relay",
  SRFLX: "srflx",
  UNKNOWN: "unknown",
} as const;

export type IceCandidateType = (typeof IceCandidateType)[keyof typeof IceCandidateType];

export const RtcTransportProtocol = {
  TCP: "tcp",
  TLS: "tls",
  UDP: "udp",
  UNKNOWN: "unknown",
} as const;

export type RtcTransportProtocol = (typeof RtcTransportProtocol)[keyof typeof RtcTransportProtocol];

export interface ClientRtcQualitySample {
  readonly audio: {
    readonly bitrateBps: number | null;
    readonly concealedSamples: number | null;
    readonly jitterMs: number | null;
    readonly packetsLost: number;
    readonly packetsReceived: number;
    readonly rttMs: number | null;
  };
  readonly channelId: string;
  readonly connection: {
    readonly iceState: string;
    readonly selectedCandidateType: IceCandidateType;
    readonly transport: RtcTransportProtocol;
  };
  readonly sessionId: string;
  readonly timestamp: string;
  readonly userId: string;
  readonly video: {
    readonly bitrateBps: number | null;
    readonly framesDropped: number | null;
    readonly framesPerSecond: number | null;
    readonly height: number | null;
    readonly packetsLost: number;
    readonly width: number | null;
  };
  readonly workspaceId: string;
}

export interface RtcStatsIngestResponse {
  readonly accepted: true;
}

export function isIceCandidateType(value: unknown): value is IceCandidateType {
  return (
    value === IceCandidateType.HOST ||
    value === IceCandidateType.RELAY ||
    value === IceCandidateType.SRFLX ||
    value === IceCandidateType.UNKNOWN
  );
}

export function isRtcTransportProtocol(value: unknown): value is RtcTransportProtocol {
  return (
    value === RtcTransportProtocol.TCP ||
    value === RtcTransportProtocol.TLS ||
    value === RtcTransportProtocol.UDP ||
    value === RtcTransportProtocol.UNKNOWN
  );
}
