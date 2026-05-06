import { createHash, createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const INTERNAL_REMOTE_ADDRESS_HEADER = "x-openvoice-remote-address";

export interface ClientAddressConfig {
  readonly trustedProxyIps?: readonly string[] | undefined;
}

export function getClientAddressFromRequest(
  request: Request,
  config: ClientAddressConfig = {},
): string {
  const remoteAddress = normalizeIp(request.headers.get(INTERNAL_REMOTE_ADDRESS_HEADER));
  if (remoteAddress && isTrustedProxy(remoteAddress, config)) {
    return readForwardedAddress(request.headers.get("x-forwarded-for")) ?? remoteAddress;
  }

  return remoteAddress ?? "local";
}

export function getClientAddressFromIncoming(
  incoming: IncomingMessage,
  config: ClientAddressConfig = {},
): string {
  const remoteAddress = normalizeIp(incoming.socket?.remoteAddress ?? null);
  if (remoteAddress && isTrustedProxy(remoteAddress, config)) {
    return readForwardedAddress(readHeader(incoming, "x-forwarded-for")) ?? remoteAddress;
  }

  return remoteAddress ?? "local";
}

export function createAuditIpHash(address: string, secret: string): string {
  const normalized = normalizeIp(address) ?? address.trim();
  const digest = createHmac("sha256", secret).update(normalized).digest("hex");
  return `sha256:${digest}`;
}

export function createStableAddressHash(address: string): string {
  return createHash("sha256").update(address).digest("hex");
}

function readForwardedAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return normalizeIp(value.split(",")[0]?.trim() ?? null);
}

function isTrustedProxy(remoteAddress: string, config: ClientAddressConfig): boolean {
  return Boolean(
    config.trustedProxyIps?.some((trustedProxy) =>
      trustedProxyMatches(remoteAddress, trustedProxy),
    ),
  );
}

function trustedProxyMatches(remoteAddress: string, trustedProxy: string): boolean {
  const normalizedTrustedProxy = normalizeIp(trustedProxy);
  if (!normalizedTrustedProxy) {
    return false;
  }

  if (normalizedTrustedProxy.includes("/")) {
    return ipv4InCidr(remoteAddress, normalizedTrustedProxy);
  }

  return normalizedTrustedProxy === remoteAddress;
}

function ipv4InCidr(remoteAddress: string, cidr: string): boolean {
  const [networkAddress, prefixText] = cidr.split("/");
  const network = parseIpv4(networkAddress ?? "");
  const address = parseIpv4(remoteAddress);
  const prefix = Number(prefixText);
  if (
    network === null ||
    address === null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (network & mask);
}

function parseIpv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    result = (result << 8) | octet;
  }

  return result >>> 0;
}

function normalizeIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}

function readHeader(incoming: IncomingMessage, name: string): string | null {
  const value = incoming.headers[name];
  return typeof value === "string" ? value : null;
}
