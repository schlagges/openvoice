import { ChannelType, OPENVOICE_PHASE, type ChannelTreeNode } from "@openvoice/shared";
import qrcode from "qrcode-generator";

import { mountChatPanel } from "./chat/chat-panel.js";
import { mountChannelTree } from "./channels/channel-tree.js";
import { mountAuditLog } from "./moderation/audit-log.js";
import { mountBrowserNotifications } from "./notifications.js";
import { mountVoiceControls, type VoiceParticipantView } from "./voice/voice-client.js";
import {
  clearSessionState,
  persistSessionState,
  readSessionCsrfToken,
  readSessionDisplayName,
} from "./session.js";

const DEFAULT_PASSWORD = "very-secure-password";
const DEFAULT_CHANNEL_NAME = "Windfang";
const UI_PREFERENCES_STORAGE_KEY = "openvoice.uiPreferences";

export type LayoutMode = "compact" | "meeting";
export type StageMode = "focus" | "fullscreen" | "grid";
export type OverlayVisibility = "docked" | "hidden" | "overlay";
export type UiScale = "0.8" | "1" | "1.2" | "1.5";
export type TileSize = "auto" | "large" | "medium" | "small";
export type Compactness = "dense" | "normal" | "relaxed";

export interface UiPreferences {
  readonly chatVisibility: OverlayVisibility;
  readonly channelVisibility: OverlayVisibility;
  readonly compactness: Compactness;
  readonly layoutMode: LayoutMode;
  readonly stageMode: StageMode;
  readonly tileSize: TileSize;
  readonly uiScale: UiScale;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  chatVisibility: "docked",
  channelVisibility: "docked",
  compactness: "normal",
  layoutMode: "meeting",
  stageMode: "grid",
  tileSize: "auto",
  uiScale: "1",
};

export function formatWebTitle(phase: typeof OPENVOICE_PHASE): string {
  return `OpenVoice Phase ${phase}`;
}

export function renderOnboardingDialog(): string {
  const displayName = currentStoredDisplayName() || createDefaultDisplayName();
  return `
    <dialog id="onboarding-dialog" class="onboarding-dialog" aria-labelledby="onboarding-title">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">OpenVoice</p>
          <h2 id="onboarding-title">Workspace starten</h2>
          <p>Mit Keycloak anmelden, eigenen Raum starten oder einer Einladung folgen.</p>
        </div>
        <button id="onboarding-close" class="icon-button" type="button" aria-label="Dialog schliessen" title="Dialog schliessen">×</button>
      </header>
      <button class="primary-action primary-action--keycloak" type="button" data-oidc-login>Mit Keycloak anmelden</button>
      <div class="onboarding-tabs" role="tablist" aria-label="Workspace starten">
        <button id="onboarding-create-tab" class="onboarding-tab is-active" type="button" data-onboarding-tab="create" role="tab" aria-controls="onboarding-create-panel" aria-selected="true">
          <strong>Erstellen</strong>
          <span>${escapeHtml(defaultWorkspaceName(displayName))}</span>
        </button>
        <button id="onboarding-join-tab" class="onboarding-tab" type="button" data-onboarding-tab="join" role="tab" aria-controls="onboarding-join-panel" aria-selected="false">
          <strong>Beitreten</strong>
          <span>Mit Invite-Code verbinden</span>
        </button>
      </div>
      <section id="onboarding-create-panel" class="onboarding-panel" data-onboarding-panel="create" role="tabpanel" aria-labelledby="onboarding-create-tab">
        <form id="workspace-create-form" class="onboarding-form">
          <input id="create-display-name" name="displayName" type="hidden" value="${escapeAttribute(displayName)}" />
          <input id="create-email" name="email" type="hidden" value="test-${crypto.randomUUID()}@example.com" />
          <input id="create-password" name="password" type="hidden" value="${DEFAULT_PASSWORD}" />
          <input id="create-channel-type" name="channelType" type="hidden" value="combined" />
          <label>
            <span>Workspace-Name</span>
            <input id="create-workspace" name="workspace" value="${escapeAttribute(defaultWorkspaceName(displayName))}" />
          </label>
          <label>
            <span>Erster Chat + Voice Channel</span>
            <input id="create-channel" name="channel" value="${DEFAULT_CHANNEL_NAME}" />
          </label>
          <p class="onboarding-hint">Channels sind in OpenVoice immer Chat + Voice: schreiben, sprechen, Kamera und Screen in einem Raum.</p>
          <button class="primary-action" type="submit">Workspace erstellen</button>
          <p id="workspace-create-status" class="form-status" role="status"></p>
        </form>
      </section>
      <section id="onboarding-join-panel" class="onboarding-panel" data-onboarding-panel="join" role="tabpanel" aria-labelledby="onboarding-join-tab" hidden>
        <form id="workspace-join-form" class="onboarding-form">
          <input id="join-email" name="email" type="hidden" value="join-${crypto.randomUUID()}@example.com" />
          <input id="join-password" name="password" type="hidden" value="${DEFAULT_PASSWORD}" />
          <label>
            <span>Anzeigename</span>
            <input id="join-display-name" name="displayName" value="${escapeAttribute(displayName)}" autocomplete="nickname" />
          </label>
          <label>
            <span>Invite-Code</span>
            <input id="join-invite-code" name="code" autocomplete="off" />
          </label>
          <button class="primary-action" type="submit">Workspace beitreten</button>
          <button class="primary-action primary-action--keycloak onboarding-keycloak-register" type="button" data-oidc-login>Bei Keycloak registrieren</button>
          <p id="workspace-join-status" class="form-status" role="status"></p>
        </form>
      </section>
    </dialog>
  `;
}

export function renderInviteDialog(): string {
  return `
    <dialog id="invite-dialog" class="invite-dialog" aria-labelledby="invite-dialog-title">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">Workspace</p>
          <h2 id="invite-dialog-title">Personen einladen</h2>
          <p id="invite-workspace-context">Erstelle einen Invite-Code fuer den aktiven Workspace.</p>
        </div>
        <button id="invite-dialog-close" class="icon-button" type="button" aria-label="Dialog schliessen" title="Dialog schliessen">×</button>
      </header>
      <div class="invite-result">
        <label>
          <span>Invite-Code</span>
          <input id="invite-code" name="code" autocomplete="off" readonly />
        </label>
        <label>
          <span>Invite-Link</span>
          <input id="invite-link" name="link" autocomplete="off" readonly />
        </label>
        <button id="invite-create" class="primary-action" type="button">Invite-Link kopieren</button>
        <p id="invite-status" class="form-status" role="status"></p>
      </div>
    </dialog>
  `;
}

export function renderOperationsLinks(): string {
  return `
    <details class="ops-links">
      <summary>Betrieb</summary>
      <div class="ops-links__grid">
        <a href="/healthz" target="_blank" rel="noreferrer">Health</a>
        <a href="/readyz" target="_blank" rel="noreferrer">Readiness</a>
        <a href="/metrics" target="_blank" rel="noreferrer">API Metrics</a>
        <a href="http://localhost:9090" target="_blank" rel="noreferrer">Prometheus</a>
        <a href="http://localhost:3001" target="_blank" rel="noreferrer">Grafana</a>
      </div>
    </details>
  `;
}

export function renderModeControls(preferences: UiPreferences = DEFAULT_UI_PREFERENCES): string {
  return `
    <section class="mode-controls" aria-label="Ansicht">
      <div class="mode-segment" role="group" aria-label="Layout Modus">
        <button class="mode-button${preferences.layoutMode === "meeting" ? " is-active" : ""}" type="button" data-layout-mode="meeting" aria-pressed="${preferences.layoutMode === "meeting"}" title="Meeting Mode">Meeting</button>
        <button class="mode-button${preferences.layoutMode === "compact" ? " is-active" : ""}" type="button" data-layout-mode="compact" aria-pressed="${preferences.layoutMode === "compact"}" title="Compact Mode">Compact</button>
      </div>
      <div class="mode-segment" role="group" aria-label="Stage Modus">
        <button class="mode-button${preferences.stageMode === "grid" ? " is-active" : ""}" type="button" data-stage-mode="grid" aria-pressed="${preferences.stageMode === "grid"}" title="Grid">Grid</button>
        <button class="mode-button${preferences.stageMode === "focus" ? " is-active" : ""}" type="button" data-stage-mode="focus" aria-pressed="${preferences.stageMode === "focus"}" title="Focus">Focus</button>
        <button class="mode-button${preferences.stageMode === "fullscreen" ? " is-active" : ""}" type="button" data-stage-mode="fullscreen" aria-pressed="${preferences.stageMode === "fullscreen"}" title="Fullscreen Grid">Fullscreen</button>
      </div>
      ${renderVisibilitySegment("Channels", "channelVisibility", preferences.channelVisibility)}
      ${renderVisibilitySegment("Chat", "chatVisibility", preferences.chatVisibility)}
      <details class="mode-settings">
        <summary aria-label="Ansicht einstellen" title="Ansicht einstellen">⚙</summary>
        <div class="mode-settings__panel">
          <label class="mode-field">
            <span>UI Scale</span>
            <select id="ui-scale" data-ui-preference="uiScale">
              <option value="0.8"${preferences.uiScale === "0.8" ? " selected" : ""}>0.8x</option>
              <option value="1"${preferences.uiScale === "1" ? " selected" : ""}>1.0x</option>
              <option value="1.2"${preferences.uiScale === "1.2" ? " selected" : ""}>1.2x</option>
              <option value="1.5"${preferences.uiScale === "1.5" ? " selected" : ""}>1.5x</option>
            </select>
          </label>
          <label class="mode-field">
            <span>Tile Size</span>
            <select id="tile-size" data-ui-preference="tileSize">
              <option value="auto"${preferences.tileSize === "auto" ? " selected" : ""}>Auto</option>
              <option value="small"${preferences.tileSize === "small" ? " selected" : ""}>Small</option>
              <option value="medium"${preferences.tileSize === "medium" ? " selected" : ""}>Medium</option>
              <option value="large"${preferences.tileSize === "large" ? " selected" : ""}>Large</option>
            </select>
          </label>
          <label class="mode-field">
            <span>Compactness</span>
            <select id="compactness" data-ui-preference="compactness">
              <option value="relaxed"${preferences.compactness === "relaxed" ? " selected" : ""}>Relaxed</option>
              <option value="normal"${preferences.compactness === "normal" ? " selected" : ""}>Normal</option>
              <option value="dense"${preferences.compactness === "dense" ? " selected" : ""}>Dense</option>
            </select>
          </label>
        </div>
      </details>
    </section>
  `;
}

function renderVisibilitySegment(
  label: string,
  key: "channelVisibility" | "chatVisibility",
  activeValue: OverlayVisibility,
): string {
  const options: readonly OverlayVisibility[] = ["hidden", "overlay", "docked"];
  return `
    <div class="mode-combo" role="group" aria-label="${label}">
      <span>${label}</span>
      <div class="mode-segment mode-segment--subtle">
        ${options
          .map(
            (value) =>
              `<button class="mode-button mode-button--icon${activeValue === value ? " is-active" : ""}" type="button" data-ui-choice="${value}" data-ui-preference="${key}" aria-pressed="${activeValue === value}" title="${label}: ${visibilityLabel(value)}">${visibilityIcon(value)}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

export function renderDesktopQrPanel(url: string = currentPageUrl()): string {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 2, margin: 1, scalable: true });

  return `
    <section class="desktop-qr" aria-label="Mobile Zugriff">
      <div class="desktop-qr__code" aria-hidden="true">${svg}</div>
      <a class="desktop-qr__link" href="${escapeAttribute(url)}" title="${escapeAttribute(url)}">Mobile öffnen</a>
    </section>
  `;
}

interface PublicWorkspace {
  readonly accessMode: "global_authenticated" | "private";
  readonly id: string;
  readonly memberCount?: number;
  readonly name: string;
  readonly ownerId: string;
}

export function renderWorkspaceSwitcher(
  workspaces: readonly PublicWorkspace[] = [],
  activeWorkspaceId = "",
): string {
  return `
    <section class="workspace-switcher" aria-label="Workspaces">
      <header class="section-header">
        <div>
          <h2>Workspaces</h2>
          <p>Server, Mitglieder und Einladungen.</p>
        </div>
        <div class="section-header__actions">
          <button class="ghost-button compact" type="button" data-open-onboarding="create" aria-label="Neu" title="Workspace erstellen">+</button>
          <button class="ghost-button compact" type="button" data-open-onboarding="join">Beitreten</button>
          <button id="workspace-refresh" class="ghost-button compact" type="button" aria-label="Workspaces aktualisieren" title="Workspaces aktualisieren">↻</button>
        </div>
      </header>
      <div id="workspace-list">${renderWorkspaceListItems(workspaces, activeWorkspaceId)}</div>
      <p id="workspace-status" class="workspace-switcher__status" role="status"></p>
    </section>
  `;
}

export function mountWebApp(app: HTMLDivElement | null): void {
  if (!app) {
    return;
  }
  hydrateSessionFromCookies();
  const uiPreferences = readUiPreferences();

  app.innerHTML = `
    <main class="app-shell">
      <aside class="channel-sidebar" aria-label="Workspace Navigation">
        <header class="sidebar-header">
          <span class="sidebar-logo" aria-hidden="true">OV</span>
          <div>
            <h1>OpenVoice</h1>
            <p id="current-user-label">Nicht angemeldet</p>
          </div>
          <div class="sidebar-header__actions">
            <button id="theme-toggle" class="icon-button" type="button" aria-label="Dark Mode umschalten" title="Dark Mode umschalten">☾</button>
          </div>
        </header>
        ${renderWorkspaceSwitcher()}
        <section class="channel-browser" aria-label="Channels">
          <header class="section-header">
            <div>
              <h2>Channels</h2>
              <p>Chat, Voice und Screen-Räume.</p>
            </div>
            <button id="invite-dialog-open" class="ghost-button compact" type="button">Einladen</button>
          </header>
          <nav id="channel-tree" class="channel-tree" aria-label="Channel Tree"></nav>
          <section id="sidebar-participants" class="sidebar-participants" aria-label="Teilnehmer"></section>
        </section>
        ${renderOnboardingDialog()}
        ${renderInviteDialog()}
        <footer class="sidebar-footer">
          <a id="account-console-link" class="ghost-button sidebar-account-link" href="#" target="_blank" rel="noreferrer" hidden>Konto verwalten</a>
          ${renderOperationsLinks()}
          <button id="logout-button" class="ghost-button sidebar-logout" type="button">Abmelden</button>
          <p id="logout-status" class="workspace-switcher__status" role="status"></p>
        </footer>
      </aside>
      <section id="workspace-panel" class="workspace-panel" aria-label="Voice Stage">
        <header class="workspace-topbar">
          <div class="topbar-context">
            <span class="topbar-room-avatar" aria-hidden="true">◉</span>
            <div>
              <p id="active-workspace-label" class="topbar-workspace">Kein Workspace</p>
              <h2 id="active-channel-title">Channel auswählen</h2>
              <p id="hierarchy-label" class="hierarchy-label">Workspace / Channel / Teilnehmer</p>
            </div>
          </div>
          <div class="topbar-center">
            ${renderModeControls(uiPreferences)}
          </div>
          <div class="topbar-actions">
            <span id="topbar-participant-count" class="topbar-participant-count" title="Teilnehmer im aktiven Channel">0</span>
            ${renderDesktopQrPanel()}
          </div>
        </header>
      </section>
      <aside id="chat-column" class="chat-column" aria-label="Chat"></aside>
    </main>
  `;

  const channelTree = app.querySelector<HTMLElement>("#channel-tree");
  if (channelTree) {
    mountChannelTree(channelTree, []);
  }

  hydrateSessionFromCookies();
  bindOnboarding(app);
  bindInviteDialog(app);
  bindWorkspaceNavigation(app);
  bindOidcLogin(app);
  bindParticipantUpdates(app);
  bindThemeToggle(app);
  bindModeControls(app);
  bindLogout(app);
  mountBrowserNotifications(app);

  const workspacePanel = app.querySelector<HTMLElement>("#workspace-panel");
  const chatColumn = app.querySelector<HTMLElement>("#chat-column");
  if (workspacePanel && chatColumn) {
    mountVoiceControls(workspacePanel);
    mountAuditLog(workspacePanel, []);
    mountChatPanel(chatColumn, []);
  }

  processInviteDeepLink(app);
  updateCurrentUserLabel(app);
  applyUiPreferences(app, uiPreferences);
}

if (typeof document !== "undefined") {
  mountWebApp(document.querySelector<HTMLDivElement>("#app"));
}

function bindOnboarding(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLDialogElement>("#onboarding-dialog");
  const close = root.querySelector<HTMLButtonElement>("#onboarding-close");
  const createForm = root.querySelector<HTMLFormElement>("#workspace-create-form");
  const joinForm = root.querySelector<HTMLFormElement>("#workspace-join-form");

  close?.addEventListener("click", () => closeDialog(dialog));

  root.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-open-onboarding]",
    );
    const tab = button?.dataset.openOnboarding;
    if (!tab) {
      return;
    }

    prepareOnboarding(root, tab);
    openDialog(dialog);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-onboarding-tab]").forEach((button) => {
    button.addEventListener("click", () => setOnboardingTab(root, button.dataset.onboardingTab));
  });

  createForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = createForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const status = root.querySelector<HTMLElement>("#workspace-create-status");
    const input = readCreateWorkspaceForm(root);

    setFormStatus(status, "Workspace wird erstellt.", "loading");
    setButtonLoading(submit, true);
    void createWorkspaceFlow(input)
      .then((result) => {
        if (localStorage.getItem("openvoice.authMode") !== "keycloak") {
          persistSession(input.displayName, { authMode: "local", csrfToken: result.csrfToken });
        }
        selectChannel(root, toTreeNode(result.channel, result.workspace.id));
        void loadWorkspaces(root, result.workspace.id).catch(() => undefined);
        setFormStatus(status, "Workspace erstellt.", "success");
        updateCurrentUserLabel(root);
        closeDialog(dialog);
      })
      .catch((error: unknown) =>
        setFormStatus(
          status,
          error instanceof Error ? error.message : "Workspace konnte nicht erstellt werden.",
          "error",
        ),
      )
      .finally(() => setButtonLoading(submit, false));
  });

  joinForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = joinForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const status = root.querySelector<HTMLElement>("#workspace-join-status");
    const input = readJoinWorkspaceForm(root);

    setFormStatus(status, "Workspace wird betreten.", "loading");
    setButtonLoading(submit, true);
    void joinWorkspaceFlow(input)
      .then((result) => {
        persistInviteSession(input.displayName, result);
        setFormStatus(status, `Workspace ${result.workspace.name} beigetreten.`, "success");
        void loadWorkspaces(root, result.workspace.id).catch(() => undefined);
        updateCurrentUserLabel(root);
        clearInviteCodeFromLocation();
        closeDialog(dialog);
      })
      .catch((error: unknown) =>
        setFormStatus(
          status,
          error instanceof Error ? error.message : "Workspace konnte nicht betreten werden.",
          "error",
        ),
      )
      .finally(() => setButtonLoading(submit, false));
  });
}

function prepareOnboarding(root: HTMLElement, tab = "create"): void {
  root
    .querySelector<HTMLDialogElement>("#onboarding-dialog")
    ?.classList.remove("is-invite-keycloak");
  const displayName = currentStoredDisplayName() || createDefaultDisplayName();
  const workspaceInput = root.querySelector<HTMLInputElement>("#create-workspace");
  const createDisplayName = root.querySelector<HTMLInputElement>("#create-display-name");
  const joinDisplayName = root.querySelector<HTMLInputElement>("#join-display-name");
  if (createDisplayName) {
    createDisplayName.value = displayName;
  }
  if (joinDisplayName) {
    joinDisplayName.value = displayName;
  }
  if (workspaceInput && (!workspaceInput.value || workspaceInput.value === "Dein Raum")) {
    workspaceInput.value = defaultWorkspaceName(displayName);
  }
  setOnboardingTab(root, tab);
}

function bindInviteDialog(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLDialogElement>("#invite-dialog");
  const open = root.querySelector<HTMLButtonElement>("#invite-dialog-open");
  const close = root.querySelector<HTMLButtonElement>("#invite-dialog-close");
  const create = root.querySelector<HTMLButtonElement>("#invite-create");

  open?.addEventListener("click", () => openDialog(dialog));
  close?.addEventListener("click", () => closeDialog(dialog));

  create?.addEventListener("click", () => {
    const workspaceId = readActiveWorkspaceId(root);
    const status = root.querySelector<HTMLElement>("#invite-status");
    if (!workspaceId) {
      setFormStatus(status, "Bitte zuerst einen Workspace auswählen.", "error");
      return;
    }

    setFormStatus(status, "Invite wird erstellt.", "loading");
    setButtonLoading(create, true);
    void createInvite(workspaceId)
      .then((invite) => {
        const codeInput = root.querySelector<HTMLInputElement>("#invite-code");
        const linkInput = root.querySelector<HTMLInputElement>("#invite-link");
        const inviteLink = createInviteLink(invite.code);
        if (codeInput) {
          codeInput.value = invite.code;
        }
        if (linkInput) {
          linkInput.value = inviteLink;
          linkInput.select();
          void navigator.clipboard?.writeText(inviteLink).catch(() => undefined);
        }
        setFormStatus(status, `Invite-Link erstellt. Gültig bis ${invite.expiresAt}.`, "success");
      })
      .catch((error: unknown) =>
        setFormStatus(
          status,
          error instanceof Error
            ? formatInviteError(error.message, readActiveWorkspaceName(root))
            : "Invite konnte nicht erstellt werden.",
          "error",
        ),
      )
      .finally(() => setButtonLoading(create, false));
  });
}

function processInviteDeepLink(root: HTMLElement): void {
  const code = readInviteCodeFromLocation();
  if (!code) {
    return;
  }

  const dialog = root.querySelector<HTMLDialogElement>("#onboarding-dialog");
  const codeInput = root.querySelector<HTMLInputElement>("#join-invite-code");
  const status = root.querySelector<HTMLElement>("#workspace-join-status");
  if (codeInput) {
    codeInput.value = code;
  }
  prepareOnboarding(root, "join");
  openDialog(dialog);
  setFormStatus(
    status,
    "Einladung erkannt. Waehle deinen Anzeigenamen und tritt als Gast bei.",
    "success",
  );
}

function bindWorkspaceNavigation(root: HTMLElement): void {
  const refresh = root.querySelector<HTMLButtonElement>("#workspace-refresh");
  const channelTree = root.querySelector<HTMLElement>("#channel-tree");

  refresh?.addEventListener("click", () => {
    void loadWorkspaces(root).catch((error: unknown) =>
      setWorkspaceStatus(
        root,
        error instanceof Error ? error.message : "Workspaces konnten nicht geladen werden.",
        "error",
      ),
    );
  });

  root.querySelector<HTMLElement>("#workspace-list")?.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-workspace-id]",
    );
    const workspaceId = button?.dataset.workspaceId;
    if (!workspaceId) {
      return;
    }

    void selectWorkspace(root, workspaceId).catch((error: unknown) =>
      setWorkspaceStatus(
        root,
        error instanceof Error ? error.message : "Workspace konnte nicht geladen werden.",
        "error",
      ),
    );
  });

  channelTree?.addEventListener("click", (event) => {
    const item =
      (event.target as Element | null)?.closest<HTMLElement>(".channel-tree__item") ?? null;
    const channel = readChannelDataset(item);
    if (!channel || channel.type === ChannelType.CATEGORY) {
      return;
    }

    selectChannel(root, channel);
  });

  void loadWorkspaces(root).catch(() => undefined);
}

function bindOidcLogin(root: HTMLElement): void {
  root.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-oidc-login]",
    );
    if (!button) {
      return;
    }

    void startOidcLogin();
  });
}

async function startOidcLogin(): Promise<void> {
  const returnPath = `${window.location.pathname || "/"}${window.location.search || ""}`;
  const returnTo = encodeURIComponent(returnPath);
  const accessToken = localStorage.getItem("openvoice.accessToken");
  if (!accessToken) {
    window.location.href = `/api/v1/auth/oidc/login?returnTo=${returnTo}`;
    return;
  }

  const response = await fetch(`/api/v1/auth/oidc/link-start?returnTo=${returnTo}`, {
    credentials: "include",
    headers: authHeader(),
    method: "POST",
  });
  if (!response.ok) {
    window.location.href = `/api/v1/auth/oidc/login?returnTo=${returnTo}`;
    return;
  }

  const body = (await response.json()) as { redirectTo?: string };
  window.location.href = body.redirectTo ?? `/api/v1/auth/oidc/login?returnTo=${returnTo}`;
}

function bindParticipantUpdates(root: HTMLElement): void {
  window.addEventListener("openvoice:participants-updated", (event) => {
    const detail = (
      event as CustomEvent<{ readonly participants: readonly VoiceParticipantView[] }>
    ).detail;
    renderSidebarParticipants(root, detail?.participants ?? []);
    renderTopbarParticipantCount(root, detail?.participants.length ?? 0);
  });
}

function bindThemeToggle(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>("#theme-toggle");
  const storedTheme = localStorage.getItem("openvoice.theme");
  applyTheme(storedTheme === "light" ? "light" : "dark", button);

  button?.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("openvoice.theme", nextTheme);
    applyTheme(nextTheme, button);
  });
}

function bindModeControls(root: HTMLElement): void {
  let preferences = readUiPreferences();
  applyUiPreferences(root, preferences);

  root.addEventListener("click", (event) => {
    const layoutButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-layout-mode]",
    );
    if (layoutButton?.dataset.layoutMode) {
      preferences = {
        ...preferences,
        layoutMode: toLayoutMode(layoutButton.dataset.layoutMode),
        ...(layoutButton.dataset.layoutMode === "compact"
          ? { channelVisibility: "docked" as const, chatVisibility: "overlay" as const }
          : {}),
      };
      writeUiPreferences(preferences);
      applyUiPreferences(root, preferences);
      return;
    }

    const stageButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-stage-mode]",
    );
    if (stageButton?.dataset.stageMode) {
      preferences = { ...preferences, stageMode: toStageMode(stageButton.dataset.stageMode) };
      writeUiPreferences(preferences);
      applyUiPreferences(root, preferences);
      if (preferences.stageMode === "fullscreen") {
        void requestAppFullscreen(root);
      }
    }

    const choiceButton = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "[data-ui-choice]",
    );
    if (choiceButton?.dataset.uiChoice) {
      preferences = updateUiPreference(
        preferences,
        choiceButton.dataset.uiPreference,
        choiceButton.dataset.uiChoice,
      );
      writeUiPreferences(preferences);
      applyUiPreferences(root, preferences);
    }
  });

  root.addEventListener("change", (event) => {
    const select = (event.target as Element | null)?.closest<HTMLSelectElement>(
      "[data-ui-preference]",
    );
    if (!select) {
      return;
    }

    preferences = updateUiPreference(preferences, select.dataset.uiPreference, select.value);
    writeUiPreferences(preferences);
    applyUiPreferences(root, preferences);
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && readUiPreferences().stageMode === "fullscreen") {
      preferences = { ...readUiPreferences(), stageMode: "grid" };
      writeUiPreferences(preferences);
      applyUiPreferences(root, preferences);
    }
  });
}

function readUiPreferences(): UiPreferences {
  if (typeof localStorage === "undefined") {
    return DEFAULT_UI_PREFERENCES;
  }

  const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_UI_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      chatVisibility: toChatVisibility(parsed.chatVisibility),
      channelVisibility: toChatVisibility(parsed.channelVisibility),
      compactness: toCompactness(parsed.compactness),
      layoutMode: toLayoutMode(parsed.layoutMode),
      stageMode: toStageMode(parsed.stageMode),
      tileSize: toTileSize(parsed.tileSize),
      uiScale: toUiScale(parsed.uiScale),
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

function writeUiPreferences(preferences: UiPreferences): void {
  localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

function applyUiPreferences(root: HTMLElement, preferences: UiPreferences): void {
  const shell = root.querySelector<HTMLElement>(".app-shell");
  if (!shell) {
    return;
  }

  shell.dataset.layoutMode = preferences.layoutMode;
  shell.dataset.stageMode = preferences.stageMode;
  shell.dataset.channelVisibility = preferences.channelVisibility;
  shell.dataset.chatVisibility = preferences.chatVisibility;
  shell.dataset.uiScale = preferences.uiScale;
  shell.dataset.tileSize = preferences.tileSize;
  shell.dataset.compactness = preferences.compactness;
  syncModeControls(root, preferences);
}

function syncModeControls(root: HTMLElement, preferences: UiPreferences): void {
  root.querySelectorAll<HTMLButtonElement>("[data-layout-mode]").forEach((button) => {
    const active = button.dataset.layoutMode === preferences.layoutMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  root.querySelectorAll<HTMLButtonElement>("[data-stage-mode]").forEach((button) => {
    const active = button.dataset.stageMode === preferences.stageMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  root.querySelectorAll<HTMLButtonElement>("[data-ui-choice]").forEach((button) => {
    const key = button.dataset.uiPreference;
    const expected =
      key === "channelVisibility" ? preferences.channelVisibility : preferences.chatVisibility;
    const active = button.dataset.uiChoice === expected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  setSelectValue(root, "#ui-scale", preferences.uiScale);
  setSelectValue(root, "#tile-size", preferences.tileSize);
  setSelectValue(root, "#compactness", preferences.compactness);
}

function updateUiPreference(
  preferences: UiPreferences,
  key: string | undefined,
  value: string,
): UiPreferences {
  switch (key) {
    case "channelVisibility":
      return { ...preferences, channelVisibility: toChatVisibility(value) };
    case "chatVisibility":
      return { ...preferences, chatVisibility: toChatVisibility(value) };
    case "uiScale":
      return { ...preferences, uiScale: toUiScale(value) };
    case "tileSize":
      return { ...preferences, tileSize: toTileSize(value) };
    case "compactness":
      return { ...preferences, compactness: toCompactness(value) };
    default:
      return preferences;
  }
}

function setSelectValue(root: HTMLElement, selector: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(selector);
  if (select) {
    select.value = value;
  }
}

async function requestAppFullscreen(root: HTMLElement): Promise<void> {
  const target = root.querySelector<HTMLElement>(".workspace-panel") ?? document.documentElement;
  await target.requestFullscreen?.().catch(() => undefined);
}

function toLayoutMode(value: unknown): LayoutMode {
  return value === "compact" ? "compact" : "meeting";
}

function toStageMode(value: unknown): StageMode {
  if (value === "focus" || value === "fullscreen") {
    return value;
  }
  return "grid";
}

function toChatVisibility(value: unknown): OverlayVisibility {
  if (value === "overlay" || value === "docked") {
    return value;
  }
  return "hidden";
}

function toUiScale(value: unknown): UiScale {
  if (value === "0.8" || value === "1.2" || value === "1.5") {
    return value;
  }
  return "1";
}

function toTileSize(value: unknown): TileSize {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "auto";
}

function toCompactness(value: unknown): Compactness {
  if (value === "relaxed" || value === "dense") {
    return value;
  }
  return "normal";
}

function bindLogout(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>("#logout-button");
  const status = root.querySelector<HTMLElement>("#logout-status");

  button?.addEventListener("click", () => {
    if (!hasStoredSession()) {
      updateCurrentUserLabel(root);
      return;
    }

    setFormStatus(status, "Session wird beendet.", "loading");
    setButtonLoading(button, true);
    void fetch("/api/v1/auth/logout", {
      credentials: "include",
      headers: {
        ...authHeader(),
        ...csrfHeader(),
      },
      method: "POST",
    })
      .catch(() => undefined)
      .then(() => {
        clearSessionState();
        updateCurrentUserLabel(root);
        renderWorkspaceList(root, [], "");
        renderWorkspaceEmptyState(root);
        setWorkspaceStatus(root, "Abgemeldet. Du kannst jetzt per Invite beitreten.", "success");
        setFormStatus(status, "Abgemeldet.", "success");
      })
      .finally(() => {
        setButtonLoading(button, false);
        updateCurrentUserLabel(root);
      });
  });

  updateCurrentUserLabel(root);
}

interface CreateWorkspaceInput {
  readonly channel: string;
  readonly channelType: "combined" | "text" | "voice";
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly workspace: string;
}

interface JoinWorkspaceInput {
  readonly code: string;
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

interface WorkspaceFlowResult {
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

interface WorkspaceListResponse {
  readonly workspaces: readonly PublicWorkspace[];
}

interface WorkspaceListRenderOptions {
  readonly localPasswordAuthEnabled?: boolean;
}

interface WorkspaceTreeResponse {
  readonly channels: readonly ChannelTreeNode[];
}

interface WorkspaceInviteResponse {
  readonly code: string;
  readonly expiresAt: string;
}

interface WorkspaceInviteJoinResponse {
  readonly accessToken?: string;
  readonly workspace: PublicWorkspace;
}

function readCreateWorkspaceForm(root: HTMLElement): CreateWorkspaceInput {
  return {
    channel: readInput(root, "#create-channel"),
    channelType: readInput(root, "#create-channel-type") as CreateWorkspaceInput["channelType"],
    displayName: readInput(root, "#create-display-name"),
    email: readInput(root, "#create-email"),
    password: readInput(root, "#create-password"),
    workspace: readInput(root, "#create-workspace"),
  };
}

function readJoinWorkspaceForm(root: HTMLElement): JoinWorkspaceInput {
  return {
    code: readInput(root, "#join-invite-code"),
    displayName: readInput(root, "#join-display-name"),
    email: readInput(root, "#join-email"),
    password: readInput(root, "#join-password"),
  };
}

async function createWorkspaceFlow(input: CreateWorkspaceInput): Promise<WorkspaceFlowResult> {
  const csrfToken = hasStoredSession()
    ? (readSessionCsrfToken() ?? "")
    : await registerTestUser(input);
  if (!csrfToken) {
    throw new Error("Bitte zuerst anmelden.");
  }
  const workspaceResponse = await fetch("/api/v1/workspaces", {
    body: JSON.stringify({ name: input.workspace }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-openvoice-csrf-token": csrfToken,
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
      "x-openvoice-csrf-token": csrfToken,
    },
    method: "POST",
  });
  if (!channelResponse.ok) {
    throw new Error(await readApiError(channelResponse));
  }
  const channelBody = (await channelResponse.json()) as WorkspaceFlowResult;

  return {
    channel: channelBody.channel,
    csrfToken,
    workspace: workspaceBody.workspace,
  };
}

async function joinWorkspaceFlow(
  input: JoinWorkspaceInput,
): Promise<WorkspaceInviteJoinResponse & { readonly accessToken: string }> {
  if (hasStoredSession()) {
    try {
      const joined = await authenticatedJoinInvite(input.code);
      return { ...joined, accessToken: localStorage.getItem("openvoice.accessToken") ?? "" };
    } catch (error) {
      if (!isAuthenticationRequiredError(error)) {
        throw error;
      }
      clearSessionState();
    }
  }

  const joined = await guestJoinInvite(input.code, input.displayName);
  if (!joined.accessToken) {
    throw new Error("Guest session token missing.");
  }

  return { ...joined, accessToken: joined.accessToken };
}

function isAuthenticationRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === "Authentication required.";
}

async function authenticatedJoinInvite(code: string): Promise<WorkspaceInviteJoinResponse> {
  const response = await fetch("/api/v1/invites/join", {
    body: JSON.stringify({ code }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeader(),
      ...csrfHeader(),
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as WorkspaceInviteJoinResponse;
}

async function registerTestUser(input: {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}): Promise<string> {
  const config = await loadAuthConfig();
  if (!config.localPasswordAuthEnabled) {
    window.location.href = `/api/v1/auth/oidc/login?returnTo=${encodeURIComponent(window.location.pathname || "/")}`;
    throw new Error("Weiterleitung zum Login.");
  }
  clearSessionState();
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
    const message = await readApiError(register);
    if (register.status === 409 && message.includes("Email is already registered")) {
      return loginTestUser(input);
    }

    throw new Error(message);
  }
  const session = (await register.json()) as { csrfToken: string };
  return session.csrfToken;
}

async function loginTestUser(input: {
  readonly email: string;
  readonly password: string;
}): Promise<string> {
  const login = await fetch("/api/v1/auth/login", {
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!login.ok) {
    throw new Error(await readApiError(login));
  }
  const session = (await login.json()) as { csrfToken: string };
  return session.csrfToken;
}

async function loadWorkspaces(root: HTMLElement, activeWorkspaceId = ""): Promise<void> {
  const response = await fetch("/api/v1/workspaces", {
    credentials: "include",
    headers: authHeader(),
  });
  if (response.status === 401) {
    const config = await loadAuthConfig();
    renderWorkspaceList(root, [], activeWorkspaceId, {
      localPasswordAuthEnabled: config.localPasswordAuthEnabled,
    });
    renderWorkspaceEmptyState(root);
    setWorkspaceStatus(root, "Bitte mit Keycloak anmelden.", "loading");
    return;
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const body = (await response.json()) as WorkspaceListResponse;
  const nextActiveWorkspaceId = activeWorkspaceId || body.workspaces[0]?.id || "";
  renderWorkspaceList(root, body.workspaces, nextActiveWorkspaceId);
  setWorkspaceStatus(
    root,
    body.workspaces.length === 0
      ? "Noch kein Workspace."
      : `${body.workspaces.length} Workspace${body.workspaces.length === 1 ? "" : "s"} sichtbar.`,
    "success",
  );

  if (nextActiveWorkspaceId) {
    await selectWorkspace(root, nextActiveWorkspaceId);
  } else {
    renderWorkspaceEmptyState(root);
  }
}

async function createInvite(workspaceId: string): Promise<WorkspaceInviteResponse> {
  const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
    body: JSON.stringify({}),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeader(),
      ...csrfHeader(),
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as WorkspaceInviteResponse;
}

function createInviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("invite", code);
  url.hash = "";
  return url.toString();
}

function readInviteCodeFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite")?.trim() ?? "";
}

function clearInviteCodeFromLocation(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

async function guestJoinInvite(
  code: string,
  displayName: string,
): Promise<WorkspaceInviteJoinResponse> {
  const response = await fetch(`/api/v1/invites/${encodeURIComponent(code)}/guest-join`, {
    body: JSON.stringify({ displayName }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as WorkspaceInviteJoinResponse;
}

async function selectWorkspace(root: HTMLElement, workspaceId: string): Promise<void> {
  setWorkspaceStatus(root, "Channel werden geladen.", "loading");
  const response = await fetch(`/api/v1/workspaces/${workspaceId}/tree`, {
    credentials: "include",
    headers: authHeader(),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const body = (await response.json()) as WorkspaceTreeResponse;
  const channelTree = root.querySelector<HTMLElement>("#channel-tree");
  if (channelTree) {
    mountChannelTree(channelTree, body.channels);
  }
  markActiveWorkspace(root, workspaceId);
  const workspaceName =
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active .workspace-switcher__name")
      ?.textContent ?? "Workspace";
  updateWorkspaceHeader(root, workspaceName, "Channel auswählen", null);
  updateInviteContext(root, workspaceName);
  setWorkspaceStatus(root, "Workspace geladen.", "success");

  const firstChannel = findFirstSelectableChannel(body.channels);
  if (firstChannel) {
    selectChannel(root, firstChannel);
  }
}

function renderWorkspaceList(
  root: HTMLElement,
  workspaces: readonly PublicWorkspace[],
  activeWorkspaceId: string,
  options: WorkspaceListRenderOptions = {},
): void {
  const list = root.querySelector<HTMLElement>("#workspace-list");
  if (list) {
    list.innerHTML = renderWorkspaceListItems(workspaces, activeWorkspaceId, options);
  }
}

function renderWorkspaceListItems(
  workspaces: readonly PublicWorkspace[],
  activeWorkspaceId: string,
  options: WorkspaceListRenderOptions = {},
): string {
  if (workspaces.length === 0) {
    const canUseLocalCreate = options.localPasswordAuthEnabled === true;
    return `
      <div class="workspace-empty">
        <strong>Noch kein Workspace</strong>
        <span>Melde dich mit Keycloak an. Danach kannst du deinen Raum erstellen oder einem Invite beitreten.</span>
        ${
          hasStoredSession()
            ? '<button class="primary-action compact" type="button" data-open-onboarding="create">Workspace erstellen</button>'
            : '<button class="primary-action primary-action--keycloak" type="button" data-oidc-login>Mit Keycloak anmelden</button>'
        }
        ${canUseLocalCreate ? '<button class="ghost-button" type="button" data-open-onboarding="create" aria-label="Workspace erstellen">Lokalen Test-Workspace erstellen</button>' : ""}
        <button class="ghost-button" type="button" data-open-onboarding="join">Invite-Code verwenden</button>
      </div>
    `;
  }

  return `<ol class="workspace-switcher__list">${workspaces
    .map(
      (workspace) => `
        <li>
          <button class="workspace-switcher__item${
            workspace.id === activeWorkspaceId ? " is-active" : ""
          }" type="button" data-workspace-id="${escapeAttribute(workspace.id)}">
            <span class="workspace-switcher__avatar" aria-hidden="true">${escapeHtml(initials(workspace.name))}</span>
            <span class="workspace-switcher__content">
              <span class="workspace-switcher__name">${escapeHtml(workspace.name)}${workspace.accessMode === "global_authenticated" ? ' <small class="workspace-switcher__badge">Global</small>' : ""}</span>
              <small>${escapeHtml(formatWorkspaceMembers(workspace))} · ${workspace.accessMode === "global_authenticated" ? "Keycloak" : `Privat`}</small>
            </span>
          </button>
        </li>
      `,
    )
    .join("")}</ol>`;
}

function renderWorkspaceEmptyState(root: HTMLElement): void {
  updateWorkspaceHeader(root, "Kein Workspace", "Noch kein Workspace", null);
  const channelTree = root.querySelector<HTMLElement>("#channel-tree");
  if (channelTree) {
    mountChannelTree(channelTree, []);
  }
}

function markActiveWorkspace(root: HTMLElement, workspaceId: string): void {
  root.querySelectorAll<HTMLElement>(".workspace-switcher__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.workspaceId === workspaceId);
  });
}

function readActiveWorkspaceName(root: HTMLElement): string {
  return (
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active .workspace-switcher__name")
      ?.textContent ?? "kein Workspace"
  );
}

function readActiveWorkspaceId(root: HTMLElement): string {
  return (
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active")?.dataset.workspaceId ??
    ""
  );
}

function readChannelDataset(item: HTMLElement | null): ChannelTreeNode | null {
  const id = item?.dataset.channelId;
  const type = item?.dataset.channelType;
  if (!id || !type) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    children: [],
    createdAt: now,
    depth: 0,
    id,
    inheritsPermissions: true,
    isArchived: false,
    name: item?.dataset.channelName ?? id,
    parentId: null,
    path: id,
    position: 0,
    slug: id,
    type: toChannelType(type),
    updatedAt: now,
    workspaceId: "",
  };
}

function selectChannel(root: HTMLElement, channel: ChannelTreeNode): void {
  root.querySelectorAll<HTMLElement>(".channel-tree__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.channelId === channel.id);
  });

  const workspaceName =
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active .workspace-switcher__name")
      ?.textContent ?? "Workspace";
  updateWorkspaceHeader(root, workspaceName, channel.name, channel.type);
  updateInviteContext(root, workspaceName);
  renderSidebarParticipants(root, []);

  window.dispatchEvent(
    new CustomEvent("openvoice:channel-selected", {
      detail: {
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        workspaceName,
      },
    }),
  );
}

function renderSidebarParticipants(
  root: HTMLElement,
  participants: readonly VoiceParticipantView[],
): void {
  const activeCount = root.querySelector<HTMLElement>(
    ".channel-tree__item.is-active .channel-tree__count",
  );
  if (activeCount) {
    activeCount.textContent = String(participants.length);
  }

  const target = root.querySelector<HTMLElement>("#sidebar-participants");
  if (!target) {
    return;
  }
  if (participants.length === 0) {
    target.innerHTML = `<p class="sidebar-participants__empty">Noch keine Voice-Teilnehmer im aktiven Channel.</p>`;
    return;
  }

  target.innerHTML = `
    <h3>Teilnehmer</h3>
    <ol class="participant-list participant-list--sidebar">
      ${participants.map(renderParticipantListItem).join("")}
    </ol>
  `;
}

function renderTopbarParticipantCount(root: HTMLElement, count: number): void {
  const target = root.querySelector<HTMLElement>("#topbar-participant-count");
  if (!target) {
    return;
  }

  target.textContent = String(count);
  target.setAttribute("aria-label", `${count} Teilnehmer im aktiven Channel`);
}

function findFirstSelectableChannel(nodes: readonly ChannelTreeNode[]): ChannelTreeNode | null {
  for (const node of nodes) {
    if (node.type !== ChannelType.CATEGORY) {
      return node;
    }
    const child = findFirstSelectableChannel(node.children);
    if (child) {
      return child;
    }
  }

  return null;
}

function renderParticipantListItem(participant: VoiceParticipantView): string {
  return `
    <li class="participant-list__item">
      <span class="participant-avatar">${escapeHtml(initials(participant.name))}</span>
      <span class="participant-list__name">${escapeHtml(participant.name)}</span>
      <span class="participant-status-icons" aria-label="${escapeAttribute(participant.statusLabel)}">
        ${participant.selfMuted ? '<span title="Mikrofon stumm">Mic aus</span>' : '<span title="Mikrofon aktiv">Mic</span>'}
        ${participant.selfDeafened ? '<span title="Audio aus">Deaf</span>' : ""}
        ${participant.cameraEnabled ? '<span title="Kamera aktiv">Cam</span>' : ""}
        ${participant.screenShareEnabled ? '<span title="Bildschirm wird geteilt">Share</span>' : ""}
      </span>
    </li>
  `;
}

function updateWorkspaceHeader(
  root: HTMLElement,
  workspaceName: string,
  channelName: string,
  channelType: ChannelType | null,
): void {
  const workspace = root.querySelector<HTMLElement>("#active-workspace-label");
  const channel = root.querySelector<HTMLElement>("#active-channel-title");
  if (workspace) {
    workspace.textContent = workspaceName;
  }
  if (channel) {
    channel.innerHTML = channelType
      ? `<span class="channel-title-icon" aria-hidden="true">${escapeHtml(channelIcon(channelType))}</span>${escapeHtml(channelName)}`
      : escapeHtml(channelName);
  }
  const hierarchy = root.querySelector<HTMLElement>("#hierarchy-label");
  if (hierarchy) {
    hierarchy.textContent = `${workspaceName} / ${channelName} / Teilnehmer`;
  }
}

function updateInviteContext(root: HTMLElement, workspaceName: string): void {
  const context = root.querySelector<HTMLElement>("#invite-workspace-context");
  if (context) {
    context.textContent = `Invite wird fuer den aktuell ausgewählten Workspace „${workspaceName}“ erstellt.`;
  }
}

function toTreeNode(channel: WorkspaceFlowResult["channel"], workspaceId: string): ChannelTreeNode {
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

function toChannelType(type: string): ChannelType {
  switch (type) {
    case "combined":
      return ChannelType.COMBINED;
    case "text":
      return ChannelType.TEXT;
    case "voice":
      return ChannelType.VOICE;
    case "category":
    default:
      return ChannelType.CATEGORY;
  }
}

function channelIcon(type: ChannelType): string {
  switch (type) {
    case ChannelType.TEXT:
      return "#";
    case ChannelType.VOICE:
      return "◉";
    case ChannelType.COMBINED:
      return "# ◉";
    case ChannelType.CATEGORY:
      return "";
  }
}

function visibilityIcon(value: OverlayVisibility): string {
  switch (value) {
    case "hidden":
      return "–";
    case "overlay":
      return "◱";
    case "docked":
      return "▣";
  }
}

function visibilityLabel(value: OverlayVisibility): string {
  switch (value) {
    case "hidden":
      return "Hidden";
    case "overlay":
      return "Overlay";
    case "docked":
      return "Docked";
  }
}

function setOnboardingTab(root: HTMLElement, tab = "create"): void {
  root.querySelectorAll<HTMLButtonElement>("[data-onboarding-tab]").forEach((button) => {
    const active = button.dataset.onboardingTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  root.querySelectorAll<HTMLElement>("[data-onboarding-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.onboardingPanel !== tab;
  });
}

function applyTheme(theme: "dark" | "light", button: HTMLButtonElement | null): void {
  document.body.dataset.theme = theme;
  if (!button) {
    return;
  }

  button.textContent = theme === "dark" ? "☀" : "☾";
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Light Mode einschalten" : "Dark Mode einschalten",
  );
  button.title = theme === "dark" ? "Light Mode einschalten" : "Dark Mode einschalten";
}

function openDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) {
    return;
  }
  if (dialog.showModal) {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

function closeDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) {
    return;
  }
  if (dialog.close) {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function persistSession(
  displayName: string,
  tokens: {
    readonly accessToken?: string;
    readonly authMode?: "guest" | "keycloak" | "local";
    readonly csrfToken?: string;
  },
): void {
  if (tokens.csrfToken) {
    persistSessionState(displayName, tokens.csrfToken);
    localStorage.removeItem("openvoice.accessToken");
  }
  if (tokens.accessToken) {
    localStorage.setItem("openvoice.accessToken", tokens.accessToken);
  }
  if (tokens.authMode) {
    localStorage.setItem("openvoice.authMode", tokens.authMode);
  }
}

function persistInviteSession(displayName: string, result: WorkspaceInviteJoinResponse): void {
  if (result.accessToken) {
    persistSession(displayName, { accessToken: result.accessToken, authMode: "guest" });
  }
}

interface AuthConfig {
  readonly localPasswordAuthEnabled: boolean;
  readonly oidc?: {
    readonly accountUrl?: string;
    readonly enabled?: boolean;
  };
}

async function loadAuthConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/v1/auth/config", { credentials: "include" });
  if (!response.ok) {
    return { localPasswordAuthEnabled: true };
  }
  return (await response.json()) as AuthConfig;
}

function hydrateSessionFromCookies(): void {
  const csrf = readCookie("openvoice_csrf");
  const authMode = readCookie("openvoice_auth");
  const display = readCookie("openvoice_display");
  if (csrf) {
    persistSessionState(display ?? currentStoredDisplayName() ?? "Keycloak User", csrf);
    localStorage.removeItem("openvoice.accessToken");
  }
  if (authMode) {
    localStorage.setItem("openvoice.authMode", authMode);
  }
}

function updateCurrentUserLabel(root: HTMLElement): void {
  const label = root.querySelector<HTMLElement>("#current-user-label");
  const logout = root.querySelector<HTMLButtonElement>("#logout-button");
  const accountLink = root.querySelector<HTMLAnchorElement>("#account-console-link");
  const csrfToken = readSessionCsrfToken();
  const accessToken = localStorage.getItem("openvoice.accessToken");
  const authMode = localStorage.getItem("openvoice.authMode");
  const displayName = readSessionDisplayName();
  const authenticated = Boolean((csrfToken || accessToken) && displayName);

  if (label) {
    label.textContent = authenticated
      ? `${displayName} · ${formatAuthMode(authMode, Boolean(accessToken))}`
      : "Nicht angemeldet";
  }

  if (accountLink) {
    const isKeycloak = authenticated && authMode === "keycloak";
    accountLink.hidden = !isKeycloak;
    if (isKeycloak) {
      void loadAuthConfig().then((config) => {
        accountLink.href = config.oidc?.accountUrl ?? "#";
      });
    }
  }

  if (logout) {
    logout.disabled = !authenticated;
    logout.title = authenticated ? "Session beenden" : "Noch nicht angemeldet";
    logout.setAttribute(
      "aria-label",
      authenticated
        ? "Abmelden und Session beenden"
        : "Abmelden nicht moeglich, keine Session aktiv",
    );
  }
}

function setButtonLoading(button: HTMLButtonElement | null | undefined, loading: boolean): void {
  if (!button) {
    return;
  }
  button.disabled = loading;
  button.dataset.loading = String(loading);
}

function readInput(root: HTMLElement, selector: string): string {
  return root.querySelector<HTMLInputElement | HTMLSelectElement>(selector)?.value.trim() ?? "";
}

function setWorkspaceStatus(
  root: HTMLElement,
  text: string,
  state: "error" | "loading" | "success",
): void {
  const element = root.querySelector<HTMLElement>("#workspace-status");
  if (!element) {
    return;
  }

  element.dataset.state = state;
  element.textContent = text;
}

function setFormStatus(
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

function csrfHeader(): Record<string, string> {
  const token = readSessionCsrfToken();
  return token ? { "x-openvoice-csrf-token": token } : {};
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("openvoice.accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function hasStoredSession(): boolean {
  if (typeof localStorage === "undefined") {
    return Boolean(readSessionCsrfToken());
  }

  return Boolean(readSessionCsrfToken() || localStorage.getItem("openvoice.accessToken"));
}

function formatAuthMode(authMode: string | null, bearerSession: boolean): string {
  if (authMode === "keycloak") {
    return "Keycloak";
  }
  if (authMode === "guest" || bearerSession) {
    return "Gast";
  }
  return "Lokal";
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function formatWorkspaceMembers(workspace: PublicWorkspace): string {
  if (typeof workspace.memberCount === "number") {
    return `${workspace.memberCount} Mitglied${workspace.memberCount === 1 ? "" : "er"}`;
  }

  return "Mitglied";
}

function formatInviteError(message: string, workspaceName: string): string {
  if (message.includes("Missing required workspace permission")) {
    return `Du bist gerade im Workspace „${workspaceName}“. Invite-Codes kann nur erstellen, wer dort MANAGE_INVITES hat. Wähle links den richtigen Workspace oder nutze Beitreten.`;
  }

  return message;
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

function currentStoredDisplayName(): string {
  return readSessionDisplayName()?.trim() ?? "";
}

function defaultWorkspaceName(displayName: string): string {
  const normalized = displayName.trim() || "Dein";
  return `${normalized}'s Raum`;
}

function createDefaultDisplayName(): string {
  const syllables = shuffle(["Bo", "To", "Lu"]);
  const name = syllables.join("");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));

  return `${name}#${suffix}`;
}

function shuffle(items: readonly string[]): string[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = result[index] ?? "";
    result[index] = result[swapIndex] ?? "";
    result[swapIndex] = current;
  }

  return result;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
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
