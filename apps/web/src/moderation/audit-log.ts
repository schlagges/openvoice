import { type PublicAuditLogEntry } from "@openvoice/shared";

export function renderAuditLog(entries: readonly PublicAuditLogEntry[]): string {
  return `
    <section class="audit-log" aria-label="Audit Log">
      <h2>Audit Log</h2>
      ${
        entries.length === 0
          ? '<p class="audit-log__empty">Noch keine Audit-Eintraege fuer diesen Testkontext.</p>'
          : `<ol class="audit-log__list">${entries.map(renderAuditEntry).join("")}</ol>`
      }
    </section>
  `;
}

export function mountAuditLog(
  root: Pick<HTMLElement, "insertAdjacentHTML">,
  entries: readonly PublicAuditLogEntry[],
): void {
  root.insertAdjacentHTML("beforeend", renderAuditLog(entries));
}

function renderAuditEntry(entry: PublicAuditLogEntry): string {
  const reason = entry.reason
    ? `<span class="audit-log__reason">${escapeHtml(entry.reason)}</span>`
    : "";

  return `
    <li class="audit-log__entry" data-audit-id="${escapeHtml(entry.id)}">
      <div class="audit-log__line">
        <strong>${escapeHtml(entry.event)}</strong>
        <span>${escapeHtml(entry.targetType)}</span>
        ${entry.targetId ? `<code>${escapeHtml(entry.targetId)}</code>` : ""}
      </div>
      <div class="audit-log__meta">
        <time datetime="${escapeHtml(entry.createdAt)}">${formatTime(entry.createdAt)}</time>
        ${entry.actorId ? `<span>Actor ${escapeHtml(entry.actorId)}</span>` : ""}
        ${reason}
      </div>
    </li>
  `;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
