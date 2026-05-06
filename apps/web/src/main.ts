import { ChannelType, OPENVOICE_PHASE, type ChannelTreeNode } from "@openvoice/shared";
import qrcode from "qrcode-generator";

import { mountChatPanel } from "./chat/chat-panel.js";
import { mountChannelTree } from "./channels/channel-tree.js";
import { mountAuditLog } from "./moderation/audit-log.js";
import { mountVoiceControls } from "./voice/voice-client.js";

export function formatWebTitle(phase: typeof OPENVOICE_PHASE): string {
  return `OpenVoice Phase ${phase}`;
}

export function renderQuickStartPanel(): string {
  return `
    <section class="quick-start" aria-label="Schnellstart">
      <h2>Schnellstart</h2>
      <p>Erstellt einen lokalen Testnutzer, Workspace und Channel. Fuer Chat und Voice zusammen ist Combined vorausgewaehlt. Danach mit der gesetzten Channel-ID Voice beitreten.</p>
      <form id="quick-start-form" class="quick-start__form">
        <label>
          <span>E-Mail</span>
          <input id="quick-email" name="email" autocomplete="email" value="test-${crypto.randomUUID()}@example.com" />
        </label>
        <label>
          <span>Passwort</span>
          <input id="quick-password" name="password" type="password" autocomplete="new-password" value="very-secure-password" />
        </label>
        <label>
          <span>Anzeigename</span>
          <input id="quick-display-name" name="displayName" value="Test User" />
        </label>
        <label>
          <span>Workspace</span>
          <input id="quick-workspace" name="workspace" value="Manual Test" />
        </label>
        <label>
          <span>Channel</span>
          <input id="quick-channel" name="channel" value="general" />
        </label>
        <label>
          <span>Channel-Typ</span>
          <select id="quick-channel-type" name="channelType">
            <option value="combined">Combined</option>
            <option value="text">Text</option>
            <option value="voice">Voice</option>
          </select>
        </label>
        <button type="submit">Testumgebung erstellen</button>
        <p id="quick-start-status" class="quick-start__status" role="status"></p>
      </form>
    </section>
  `;
}

export function renderOperationsLinks(): string {
  return `
    <section class="ops-links" aria-label="Betrieb">
      <h2>Betrieb</h2>
      <div class="ops-links__grid">
        <a href="/healthz" target="_blank" rel="noreferrer">Health</a>
        <a href="/readyz" target="_blank" rel="noreferrer">Readiness</a>
        <a href="/metrics" target="_blank" rel="noreferrer">API Metrics</a>
        <a href="http://localhost:9090" target="_blank" rel="noreferrer">Prometheus</a>
        <a href="http://localhost:3001" target="_blank" rel="noreferrer">Grafana</a>
      </div>
    </section>
  `;
}

export function renderDesktopQrPanel(url: string = currentPageUrl()): string {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });

  return `
    <section class="desktop-qr" aria-label="Mobile Zugriff">
      <div>
        <h2>Auf dem Handy öffnen</h2>
        <p>QR-Code scannen und diese OpenVoice-Seite direkt aufrufen.</p>
      </div>
      <div class="desktop-qr__code" aria-hidden="true">${svg}</div>
      <a class="desktop-qr__link" href="${escapeAttribute(url)}">${escapeHtml(url)}</a>
    </section>
  `;
}

export function mountWebApp(app: HTMLDivElement | null): void {
  if (!app) {
    return;
  }

  app.innerHTML = `
    <main class="app-shell">
      <aside class="channel-sidebar" aria-label="Channels">
        <h1>${formatWebTitle(OPENVOICE_PHASE)}</h1>
        <nav id="channel-tree" class="channel-tree" aria-label="Channel Tree"></nav>
        ${renderQuickStartPanel()}
        ${renderDesktopQrPanel()}
        ${renderOperationsLinks()}
      </aside>
      <section id="workspace-panel" class="workspace-panel" aria-label="Workspace"></section>
    </main>
  `;

  const channelTree = app.querySelector<HTMLElement>("#channel-tree");
  if (channelTree) {
    mountChannelTree(channelTree, []);
  }

  bindQuickStart(app);

  const workspacePanel = app.querySelector<HTMLElement>("#workspace-panel");
  if (workspacePanel) {
    mountChatPanel(workspacePanel, []);
    mountVoiceControls(workspacePanel);
    mountAuditLog(workspacePanel, []);
  }
}

if (typeof document !== "undefined") {
  mountWebApp(document.querySelector<HTMLDivElement>("#app"));
}

function bindQuickStart(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>("#quick-start-form");
  const status = root.querySelector<HTMLElement>("#quick-start-status");
  const channelTree = root.querySelector<HTMLElement>("#channel-tree");
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = readQuickStartForm(root);

    setQuickStartStatus(status, "Testumgebung wird erstellt.", "loading");
    if (submit) {
      submit.disabled = true;
    }

    void createQuickStart(input)
      .then((result) => {
        localStorage.setItem("openvoice.csrfToken", result.csrfToken);
        const voiceInput = root.querySelector<HTMLInputElement>("#voice-channel-id");
        if (voiceInput) {
          voiceInput.value = result.channel.id;
        }
        if (channelTree) {
          mountChannelTree(channelTree, [toTreeNode(result.channel, result.workspace.id)]);
        }
        setQuickStartStatus(
          status,
          `Bereit. Channel-ID ${result.channel.id}. Jetzt Voice beitreten klicken.`,
          "success",
        );
      })
      .catch((error: unknown) => {
        setQuickStartStatus(
          status,
          error instanceof Error ? error.message : "Testumgebung konnte nicht erstellt werden.",
          "error",
        );
      })
      .finally(() => {
        if (submit) {
          submit.disabled = false;
        }
      });
  });
}

interface QuickStartInput {
  readonly channel: string;
  readonly channelType: "combined" | "text" | "voice";
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly workspace: string;
}

interface QuickStartResult {
  readonly channel: {
    readonly id: string;
    readonly name: string;
    readonly type: "combined" | "text" | "voice";
  };
  readonly csrfToken: string;
  readonly workspace: {
    readonly id: string;
  };
}

function readQuickStartForm(root: HTMLElement): QuickStartInput {
  return {
    channel: readInput(root, "#quick-channel"),
    channelType: readInput(root, "#quick-channel-type") as QuickStartInput["channelType"],
    displayName: readInput(root, "#quick-display-name"),
    email: readInput(root, "#quick-email"),
    password: readInput(root, "#quick-password"),
    workspace: readInput(root, "#quick-workspace"),
  };
}

async function createQuickStart(input: QuickStartInput): Promise<QuickStartResult> {
  localStorage.removeItem("openvoice.csrfToken");
  const register = await fetch("/api/v1/auth/register", {
    body: JSON.stringify({
      displayName: input.displayName,
      email: input.email,
      password: input.password,
    }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!register.ok) {
    throw new Error(await readApiError(register));
  }
  const session = (await register.json()) as { csrfToken: string };
  localStorage.setItem("openvoice.csrfToken", session.csrfToken);

  const workspaceResponse = await fetch("/api/v1/workspaces", {
    body: JSON.stringify({ name: input.workspace }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-openvoice-csrf-token": session.csrfToken,
    },
    method: "POST",
  });
  if (!workspaceResponse.ok) {
    throw new Error(await readApiError(workspaceResponse));
  }
  const workspaceBody = (await workspaceResponse.json()) as { workspace: { id: string } };

  const channelResponse = await fetch(`/api/v1/workspaces/${workspaceBody.workspace.id}/channels`, {
    body: JSON.stringify({
      name: input.channel,
      position: 0,
      type: input.channelType,
    }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-openvoice-csrf-token": session.csrfToken,
    },
    method: "POST",
  });
  if (!channelResponse.ok) {
    throw new Error(await readApiError(channelResponse));
  }
  const channelBody = (await channelResponse.json()) as QuickStartResult;

  return {
    channel: channelBody.channel,
    csrfToken: session.csrfToken,
    workspace: workspaceBody.workspace,
  };
}

function toTreeNode(channel: QuickStartResult["channel"], workspaceId: string): ChannelTreeNode {
  const now = new Date().toISOString();
  return {
    children: [],
    createdAt: now,
    depth: 0,
    id: channel.id,
    inheritsPermissions: true,
    isArchived: false,
    name: channel.name,
    parentId: null,
    path: channel.id,
    position: 0,
    slug: channel.name,
    type: toChannelType(channel.type),
    updatedAt: now,
    workspaceId,
  };
}

function toChannelType(type: QuickStartInput["channelType"]): ChannelType {
  switch (type) {
    case "combined":
      return ChannelType.COMBINED;
    case "text":
      return ChannelType.TEXT;
    case "voice":
      return ChannelType.VOICE;
  }
}

function readInput(root: HTMLElement, selector: string): string {
  return root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value.trim() ?? "";
}

function setQuickStartStatus(
  element: HTMLElement | null,
  text: string,
  state: "error" | "loading" | "success",
): void {
  if (!element) {
    return;
  }
  element.dataset.state = state;
  element.textContent = text;
}

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  return typeof body?.error?.message === "string"
    ? body.error.message
    : `Request failed with ${response.status}.`;
}

function currentPageUrl(): string {
  if (typeof window === "undefined") {
    return "https://voice.schnick-schnack.info";
  }

  return window.location.href;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
