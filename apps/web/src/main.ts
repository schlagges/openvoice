import { ChannelType, OPENVOICE_PHASE, type ChannelTreeNode } from "@openvoice/shared";
import qrcode from "qrcode-generator";

import { mountChatPanel } from "./chat/chat-panel.js";
import { mountChannelTree } from "./channels/channel-tree.js";
import { mountAuditLog } from "./moderation/audit-log.js";
import { mountVoiceControls, type VoiceParticipantView } from "./voice/voice-client.js";

const DEFAULT_PASSWORD = "very-secure-password";

export function formatWebTitle(phase: typeof OPENVOICE_PHASE): string {
  return `OpenVoice Phase ${phase}`;
}

export function renderOnboardingDialog(): string {
  return `
    <dialog id="onboarding-dialog" class="onboarding-dialog" aria-labelledby="onboarding-title">
      <header class="dialog-header">
        <div>
          <p class="eyebrow">Lokaler Testmodus</p>
          <h2 id="onboarding-title">Workspace starten</h2>
          <p>Erstelle einen neuen Workspace oder tritt einem bestehenden Workspace bei.</p>
        </div>
        <button id="onboarding-close" class="icon-button" type="button" aria-label="Dialog schliessen" title="Dialog schliessen">×</button>
      </header>
      <div class="onboarding-tabs" role="tablist" aria-label="Workspace starten">
        <button id="onboarding-create-tab" class="onboarding-tab is-active" type="button" data-onboarding-tab="create" role="tab" aria-controls="onboarding-create-panel" aria-selected="true">
          <strong>Erstellen</strong>
          <span>Eigenen Workspace starten</span>
        </button>
        <button id="onboarding-join-tab" class="onboarding-tab" type="button" data-onboarding-tab="join" role="tab" aria-controls="onboarding-join-panel" aria-selected="false">
          <strong>Beitreten</strong>
          <span>Mit Invite-Code verbinden</span>
        </button>
      </div>
      <section id="onboarding-create-panel" class="onboarding-panel" data-onboarding-panel="create" role="tabpanel" aria-labelledby="onboarding-create-tab">
        <form id="workspace-create-form" class="onboarding-form">
          <label>
            <span>Anzeigename</span>
            <input id="create-display-name" name="displayName" autocomplete="name" value="${escapeAttribute(createDefaultDisplayName())}" />
          </label>
          <label>
            <span>Workspace-Name</span>
            <input id="create-workspace" name="workspace" value="18 Löcher" />
          </label>
          <label>
            <span>Erster Channel</span>
            <input id="create-channel" name="channel" value="Windfang" />
          </label>
          <label>
            <span>Channel-Typ</span>
            <select id="create-channel-type" name="channelType">
              <option value="combined">Chat + Voice</option>
              <option value="text">Chat</option>
              <option value="voice">Voice</option>
            </select>
          </label>
          <details class="advanced-test-data">
            <summary>Erweiterte Testdaten</summary>
            <label>
              <span>E-Mail</span>
              <input id="create-email" name="email" autocomplete="email" value="test-${crypto.randomUUID()}@example.com" />
            </label>
            <label>
              <span>Passwort</span>
              <input id="create-password" name="password" type="password" autocomplete="new-password" value="${DEFAULT_PASSWORD}" />
            </label>
          </details>
          <button class="primary-action" type="submit">Workspace erstellen</button>
          <p id="workspace-create-status" class="form-status" role="status"></p>
        </form>
      </section>
      <section id="onboarding-join-panel" class="onboarding-panel" data-onboarding-panel="join" role="tabpanel" aria-labelledby="onboarding-join-tab" hidden>
        <form id="workspace-join-form" class="onboarding-form">
          <label>
            <span>Anzeigename</span>
            <input id="join-display-name" name="displayName" autocomplete="name" value="${escapeAttribute(createDefaultDisplayName())}" />
          </label>
          <label>
            <span>Invite-Code</span>
            <input id="join-invite-code" name="code" autocomplete="off" />
          </label>
          <details class="advanced-test-data">
            <summary>Erweiterte Testdaten</summary>
            <label>
              <span>E-Mail</span>
              <input id="join-email" name="email" autocomplete="email" value="join-${crypto.randomUUID()}@example.com" />
            </label>
            <label>
              <span>Passwort</span>
              <input id="join-password" name="password" type="password" autocomplete="new-password" value="${DEFAULT_PASSWORD}" />
            </label>
          </details>
          <button class="primary-action" type="submit">Workspace beitreten</button>
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
        <button id="invite-create" class="primary-action" type="button">Invite-Code erstellen</button>
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
          <p>Ebene 1: Server und Mitglieder.</p>
        </div>
        <div class="section-header__actions">
          <button class="ghost-button compact" type="button" data-open-onboarding="create">Neu</button>
          <button class="ghost-button compact" type="button" data-open-onboarding="join">Beitreten</button>
          <button id="workspace-refresh" class="ghost-button compact" type="button">Aktualisieren</button>
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

  app.innerHTML = `
    <main class="app-shell">
      <aside class="channel-sidebar" aria-label="Workspace Navigation">
        <header class="sidebar-header">
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
              <p>Ebene 2: Räume im gewählten Workspace.</p>
            </div>
            <button id="invite-dialog-open" class="ghost-button" type="button">Personen einladen</button>
          </header>
          <nav id="channel-tree" class="channel-tree" aria-label="Channel Tree"></nav>
          <section id="sidebar-participants" class="sidebar-participants" aria-label="Teilnehmer"></section>
        </section>
        ${renderOnboardingDialog()}
        ${renderInviteDialog()}
        <footer class="sidebar-footer">
          ${renderOperationsLinks()}
          <button id="logout-button" class="ghost-button sidebar-logout" type="button">Abmelden</button>
          <p id="logout-status" class="workspace-switcher__status" role="status"></p>
        </footer>
      </aside>
      <section id="workspace-panel" class="workspace-panel" aria-label="Voice Stage">
        <header class="workspace-topbar">
          <div>
            <p id="active-workspace-label" class="eyebrow">Kein Workspace</p>
            <h2 id="active-channel-title">Channel auswählen</h2>
            <p id="hierarchy-label" class="hierarchy-label">Workspace → Channel → Teilnehmer</p>
          </div>
          ${renderDesktopQrPanel()}
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
  bindLogout(app);

  const workspacePanel = app.querySelector<HTMLElement>("#workspace-panel");
  const chatColumn = app.querySelector<HTMLElement>("#chat-column");
  if (workspacePanel && chatColumn) {
    mountVoiceControls(workspacePanel);
    mountAuditLog(workspacePanel, []);
    mountChatPanel(chatColumn, []);
  }

  updateCurrentUserLabel(app);
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

    setOnboardingTab(root, tab);
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
        persistSession(input.displayName, { csrfToken: result.csrfToken });
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
        persistSession(input.displayName, { accessToken: result.accessToken });
        setFormStatus(status, `Workspace ${result.workspace.name} beigetreten.`, "success");
        void loadWorkspaces(root, result.workspace.id).catch(() => undefined);
        updateCurrentUserLabel(root);
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
        const input = root.querySelector<HTMLInputElement>("#invite-code");
        if (input) {
          input.value = invite.code;
          input.select();
          void navigator.clipboard?.writeText(invite.code).catch(() => undefined);
        }
        setFormStatus(status, `Invite-Code erstellt. Gültig bis ${invite.expiresAt}.`, "success");
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
  const returnTo = encodeURIComponent(window.location.pathname || "/");
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
        localStorage.removeItem("openvoice.csrfToken");
        localStorage.removeItem("openvoice.accessToken");
        localStorage.removeItem("openvoice.displayName");
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
    ? (localStorage.getItem("openvoice.csrfToken") ?? "")
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
    const joined = await authenticatedJoinInvite(input.code);
    return { ...joined, accessToken: localStorage.getItem("openvoice.accessToken") ?? "" };
  }

  const config = await loadAuthConfig();
  if (!config.localPasswordAuthEnabled) {
    window.location.href = `/api/v1/auth/oidc/login?returnTo=${encodeURIComponent(window.location.pathname || "/")}`;
    throw new Error("Weiterleitung zum Login.");
  }

  const joined = await guestJoinInvite(input.code, input.displayName);
  if (!joined.accessToken) {
    throw new Error("Guest session token missing.");
  }

  return { ...joined, accessToken: joined.accessToken };
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
    renderWorkspaceList(root, [], activeWorkspaceId);
    renderWorkspaceEmptyState(root);
    setWorkspaceStatus(root, "Nicht angemeldet.", "error");
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
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active span")?.textContent ??
    "Workspace";
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
): void {
  const list = root.querySelector<HTMLElement>("#workspace-list");
  if (list) {
    list.innerHTML = renderWorkspaceListItems(workspaces, activeWorkspaceId);
  }
}

function renderWorkspaceListItems(
  workspaces: readonly PublicWorkspace[],
  activeWorkspaceId: string,
): string {
  if (workspaces.length === 0) {
    return `
      <div class="workspace-empty">
        <strong>Noch kein Workspace</strong>
        <span>Erstelle einen Workspace oder tritt einem bestehenden per Invite-Code bei.</span>
        <button class="primary-action compact" type="button" data-open-onboarding="create">Workspace erstellen</button>
        ${
          hasStoredSession()
            ? ""
            : '<button class="ghost-button" type="button" data-oidc-login>Mit Keycloak anmelden</button>'
        }
        <button class="ghost-button" type="button" data-open-onboarding="join">Workspace beitreten</button>
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
            <span>${escapeHtml(workspace.name)}</span>
            <small>${escapeHtml(formatWorkspaceMembers(workspace))} · Owner ${escapeHtml(workspace.ownerId.slice(0, 8))}</small>
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
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active span")?.textContent ??
    "kein Workspace"
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
    root.querySelector<HTMLElement>(".workspace-switcher__item.is-active span")?.textContent ??
    "Workspace";
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
    channel.textContent = channelType ? `${channelIcon(channelType)} ${channelName}` : channelName;
  }
  const hierarchy = root.querySelector<HTMLElement>("#hierarchy-label");
  if (hierarchy) {
    hierarchy.textContent = `${workspaceName} → ${channelName} → Teilnehmer`;
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
      return "Voice";
    case ChannelType.COMBINED:
      return "# Voice";
    case ChannelType.CATEGORY:
      return "";
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
  tokens: { readonly accessToken?: string; readonly csrfToken?: string },
): void {
  if (tokens.csrfToken) {
    localStorage.setItem("openvoice.csrfToken", tokens.csrfToken);
    localStorage.removeItem("openvoice.accessToken");
  }
  if (tokens.accessToken) {
    localStorage.setItem("openvoice.accessToken", tokens.accessToken);
    localStorage.removeItem("openvoice.csrfToken");
  }
  localStorage.setItem("openvoice.displayName", displayName);
}

interface AuthConfig {
  readonly localPasswordAuthEnabled: boolean;
  readonly oidc?: {
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
  const display = readCookie("openvoice_display");
  if (csrf) {
    localStorage.setItem("openvoice.csrfToken", csrf);
    localStorage.removeItem("openvoice.accessToken");
  }
  if (display) {
    localStorage.setItem("openvoice.displayName", display);
  }
}

function updateCurrentUserLabel(root: HTMLElement): void {
  const label = root.querySelector<HTMLElement>("#current-user-label");
  const logout = root.querySelector<HTMLButtonElement>("#logout-button");
  const csrfToken = localStorage.getItem("openvoice.csrfToken");
  const accessToken = localStorage.getItem("openvoice.accessToken");
  const displayName = localStorage.getItem("openvoice.displayName");
  const authenticated = Boolean((csrfToken || accessToken) && displayName);

  if (label) {
    label.textContent = authenticated ? displayName : "Nicht angemeldet";
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
  const token = localStorage.getItem("openvoice.csrfToken");
  return token ? { "x-openvoice-csrf-token": token } : {};
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("openvoice.accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function hasStoredSession(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }

  return Boolean(
    localStorage.getItem("openvoice.csrfToken") || localStorage.getItem("openvoice.accessToken"),
  );
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
