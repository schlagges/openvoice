import { AsyncLocalStorage } from "node:async_hooks";

interface AuditContext {
  readonly ipHash: string | null;
}

const auditContextStorage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(context: AuditContext, callback: () => T): T {
  return auditContextStorage.run(context, callback);
}

export function getAuditIpHash(): string | null {
  return auditContextStorage.getStore()?.ipHash ?? null;
}
