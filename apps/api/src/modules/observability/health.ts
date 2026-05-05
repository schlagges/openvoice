import { createConnection } from "node:net";

export interface HealthCheck {
  readonly name: string;
  run(): Promise<void>;
}

export interface HealthReport {
  readonly checks?: readonly HealthReportCheck[];
  readonly status: "ok" | "unready";
  readonly timestamp: string;
  readonly uptimeSeconds: number;
}

export interface HealthReportCheck {
  readonly name: string;
  readonly ok: boolean;
}

export class HealthService {
  private readonly checks: readonly HealthCheck[];
  private readonly startedAt = Date.now();

  public constructor(checks: readonly HealthCheck[] = []) {
    this.checks = checks;
  }

  public liveness(): HealthReport {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: this.uptimeSeconds,
    };
  }

  public async readiness(): Promise<HealthReport> {
    const checks = await Promise.all(
      this.checks.map(async (check) => {
        try {
          await check.run();
          return { name: check.name, ok: true };
        } catch {
          return { name: check.name, ok: false };
        }
      }),
    );
    const ready = checks.every((check) => check.ok);

    return {
      checks,
      status: ready ? "ok" : "unready",
      timestamp: new Date().toISOString(),
      uptimeSeconds: this.uptimeSeconds,
    };
  }

  private get uptimeSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}

export function createTcpReadinessCheck(input: {
  readonly name: string;
  readonly timeoutMs?: number;
  readonly url: string;
}): HealthCheck {
  return {
    name: input.name,
    run: () => checkTcpUrl(input.url, input.timeoutMs ?? 1_000),
  };
}

async function checkTcpUrl(rawUrl: string, timeoutMs: number): Promise<void> {
  const url = parseTcpUrl(rawUrl);
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: url.hostname, port: url.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("readiness check timed out"));
    }, timeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function parseTcpUrl(rawUrl: string): { readonly hostname: string; readonly port: number } {
  const url = new URL(rawUrl);
  const port = url.port ? Number.parseInt(url.port, 10) : defaultPort(url.protocol);

  if (!url.hostname || !Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid TCP readiness URL: ${rawUrl}`);
  }

  return {
    hostname: url.hostname,
    port,
  };
}

function defaultPort(protocol: string): number {
  if (protocol === "postgres:" || protocol === "redis:") {
    return protocol === "postgres:" ? 5432 : 6379;
  }
  if (protocol === "http:" || protocol === "ws:") {
    return 80;
  }
  if (protocol === "https:" || protocol === "wss:") {
    return 443;
  }

  return 0;
}
