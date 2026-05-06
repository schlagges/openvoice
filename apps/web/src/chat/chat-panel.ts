import { MessageContentFormat, MessageEventType, type Message } from "@openvoice/shared";

interface CreateMessageResponse {
  readonly duplicate: boolean;
  readonly message: Message;
}

interface ListMessagesResponse {
  readonly messages: readonly Message[];
}

interface MeResponse {
  readonly user: {
    readonly displayName: string;
    readonly id: string;
  };
}

interface ChannelSelectionDetail {
  readonly channelId: string;
  readonly channelName: string;
  readonly channelType: string;
}

interface ParticipantUpdateDetail {
  readonly participants: readonly {
    readonly identity: string;
    readonly isLocal: boolean;
    readonly name: string;
  }[];
}

interface MessageDispatchEnvelope {
  readonly d: Message;
  readonly op: "DISPATCH";
  readonly t: string;
}

let selectedChannelId = "";
let activeMessageSocket: WebSocket | null = null;
let activeMessageSocketChannelId = "";
let activeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentUserId = "";
let reconnectAttempt = 0;

const MAX_RECONNECT_DELAY_MS = 10_000;
const authorNameCache = new Map<string, string>();

export function renderChatPanel(messages: readonly Message[], channelName = "Nachrichten"): string {
  return `
    <section class="chat-panel" aria-label="Chat">
      <header class="chat-panel__header">
        <div>
          <p class="eyebrow">Chat</p>
          <h2>${escapeHtml(channelName)}</h2>
        </div>
        <span class="status-pill">${messages.length} Nachrichten</span>
      </header>
      ${
        messages.length === 0
          ? `<div class="chat-empty" role="status">
              <strong>Noch keine Nachrichten</strong>
              <span>Waehle einen Text- oder Combined-Channel und sende eine erste Testnachricht.</span>
            </div>`
          : `<ol class="chat-messages">${[...messages].sort(compareMessagesAsc).map(renderMessage).join("")}</ol>`
      }
      <form class="chat-composer">
        <label class="chat-composer__label" for="chat-message-input">Nachricht</label>
        <div class="chat-composer__field">
          <textarea id="chat-message-input" class="chat-composer__input" name="message" rows="1" placeholder="Nachricht schreiben"></textarea>
          <button class="chat-composer__send" type="submit" aria-label="Nachricht senden" title="Nachricht senden">↵</button>
        </div>
        <p id="chat-composer-status" class="chat-composer__status" role="status"></p>
      </form>
    </section>
  `;
}

export function mountChatPanel(root: HTMLElement, messages: readonly Message[]): void {
  root.insertAdjacentHTML("beforeend", renderChatPanel(messages));
  bindChatComposer(root);
}

function bindChatComposer(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>(".chat-composer");
  const input = root.querySelector<HTMLTextAreaElement>("#chat-message-input");
  const status = root.querySelector<HTMLElement>("#chat-composer-status");
  const submit = root.querySelector<HTMLButtonElement>(".chat-composer__send");

  rememberLocalDisplayName();
  void hydrateCurrentUser(root);

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    form?.requestSubmit();
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const content = input?.value.trim() ?? "";
    if (!content) {
      setStatus(status, "Nachricht darf nicht leer sein.", "error");
      return;
    }

    const channelId = readCurrentChannelId();
    if (!channelId) {
      setStatus(status, "Bitte zuerst einen Text- oder Combined-Channel auswählen.", "error");
      return;
    }

    void createMessage(channelId, content)
      .then(({ message }) => {
        rememberLocalAuthor(message.authorId);
        upsertMessage(root, message);
        if (input) {
          input.value = "";
        }
        setStatus(status, "Nachricht gesendet.", "success");
      })
      .catch((error: unknown) => {
        setStatus(
          status,
          error instanceof Error ? error.message : "Nachricht konnte nicht gesendet werden.",
          "error",
        );
      })
      .finally(() => {
        if (submit) {
          submit.disabled = false;
        }
      });

    if (submit) {
      submit.disabled = true;
    }
    setStatus(status, "Nachricht wird gesendet.", "loading");
  });

  const channelId = readCurrentChannelId();
  if (channelId) {
    void loadMessages(root, channelId).catch(() => undefined);
  }

  window.addEventListener("openvoice:channel-selected", (event) => {
    const detail = (event as CustomEvent<ChannelSelectionDetail>).detail;
    selectedChannelId = detail.channelId;
    updateChatTitle(root, detail.channelName);
    if (detail.channelType === "voice") {
      closeMessageSocket({ reconnect: false });
      setStatus(status, "Voice-Channel ausgewaehlt.", "success");
      return;
    }
    if (detail.channelType !== "text" && detail.channelType !== "combined") {
      closeMessageSocket({ reconnect: false });
      setStatus(status, "Dieser Channel hat keinen Textverlauf.", "success");
      return;
    }

    setStatus(status, "Nachrichten werden geladen.", "loading");
    void loadMessages(root, detail.channelId)
      .then(() => {
        reconnectAttempt = 0;
        openMessageSocket(root, detail.channelId, status);
        setStatus(status, "Channel geladen. Live-Sync aktiv.", "success");
      })
      .catch(() => setStatus(status, "Nachrichten konnten nicht geladen werden.", "error"));
  });

  window.addEventListener("openvoice:participants-updated", (event) => {
    const detail = (event as CustomEvent<ParticipantUpdateDetail>).detail;
    let changed = false;
    for (const participant of detail?.participants ?? []) {
      changed = rememberChatAuthor(participant.identity, participant.name) || changed;
      if (participant.isLocal) {
        currentUserId = participant.identity;
      }
    }
    if (changed) {
      refreshRenderedAuthors(root);
    }
  });
}

async function createMessage(channelId: string, content: string): Promise<CreateMessageResponse> {
  const response = await fetch(`/api/v1/channels/${encodeURIComponent(channelId)}/messages`, {
    body: JSON.stringify({
      clientMessageId: crypto.randomUUID(),
      content,
      contentFormat: MessageContentFormat.MARKDOWN,
    }),
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeader(),
      ...csrfHeader(),
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readMessageError(response));
  }

  return (await response.json()) as CreateMessageResponse;
}

async function loadMessages(root: HTMLElement, channelId: string): Promise<void> {
  const response = await fetch(`/api/v1/channels/${encodeURIComponent(channelId)}/messages`, {
    credentials: "include",
    headers: authHeader(),
  });

  if (!response.ok) {
    return;
  }

  const body = (await response.json()) as ListMessagesResponse;
  replaceMessages(root, body.messages);
}

async function hydrateCurrentUser(root: HTMLElement): Promise<void> {
  const response = await fetch("/api/v1/me", {
    credentials: "include",
    headers: authHeader(),
  });
  if (!response.ok) {
    return;
  }

  const body = (await response.json()) as MeResponse;
  currentUserId = body.user.id;
  if (rememberChatAuthor(body.user.id, body.user.displayName)) {
    refreshRenderedAuthors(root);
  }
}

function upsertMessage(root: HTMLElement, message: Message): void {
  const list = ensureMessageList(root);
  const existing = list.querySelector<HTMLElement>(`[data-message-id="${cssEscape(message.id)}"]`);
  if (existing) {
    existing.outerHTML = renderMessage(message);
  } else {
    list.insertAdjacentHTML("beforeend", renderMessage(message));
  }
  sortMessageList(list);
  list.scrollTop = list.scrollHeight;
  updateMessageCount(root, list.children.length);
}

function replaceMessages(root: HTMLElement, messages: readonly Message[]): void {
  const list = ensureMessageList(root);
  list.innerHTML = [...messages].sort(compareMessagesAsc).map(renderMessage).join("");
  list.scrollTop = list.scrollHeight;
  updateMessageCount(root, messages.length);
}

function ensureMessageList(root: HTMLElement): HTMLOListElement {
  const existing = root.querySelector<HTMLOListElement>(".chat-messages");
  if (existing) {
    return existing;
  }

  const empty = root.querySelector<HTMLElement>(".chat-empty");
  const list = document.createElement("ol");
  list.className = "chat-messages";
  empty?.replaceWith(list);
  return list;
}

function updateMessageCount(root: HTMLElement, count: number): void {
  const pill = root.querySelector<HTMLElement>(".chat-panel__header .status-pill");
  if (pill) {
    pill.textContent = `${count} Nachrichten`;
  }
}

function updateChatTitle(root: HTMLElement, title: string): void {
  const heading = root.querySelector<HTMLElement>(".chat-panel__header h2");
  if (heading) {
    heading.textContent = title;
  }
}

function openMessageSocket(root: HTMLElement, channelId: string, status: HTMLElement | null): void {
  if (activeMessageSocket && activeMessageSocketChannelId === channelId) {
    return;
  }

  closeMessageSocket({ reconnect: false });
  activeMessageSocketChannelId = channelId;
  const socket = new WebSocket(messageSocketUrl(channelId));
  activeMessageSocket = socket;

  socket.addEventListener("open", () => {
    if (activeMessageSocket === socket) {
      reconnectAttempt = 0;
      setStatus(status, "Live-Sync aktiv.", "success");
    }
  });

  socket.addEventListener("message", (event) => {
    const envelope = parseMessageEnvelope(event.data);
    if (!envelope || envelope.d.channelId !== channelId) {
      return;
    }

    if (
      envelope.t === MessageEventType.CREATE ||
      envelope.t === MessageEventType.UPDATE ||
      envelope.t === MessageEventType.DELETE
    ) {
      upsertMessage(root, envelope.d);
    }
  });

  socket.addEventListener("close", () => {
    if (activeMessageSocket === socket) {
      activeMessageSocket = null;
      activeMessageSocketChannelId = "";
      scheduleMessageReconnect(root, channelId, status);
    }
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

function closeMessageSocket(options: { readonly reconnect: boolean }): void {
  if (!options.reconnect) {
    clearReconnectTimer();
  }
  const socket = activeMessageSocket;
  activeMessageSocket = null;
  activeMessageSocketChannelId = "";
  socket?.close();
}

function scheduleMessageReconnect(
  root: HTMLElement,
  channelId: string,
  status: HTMLElement | null,
): void {
  if (selectedChannelId !== channelId) {
    return;
  }

  clearReconnectTimer();
  const delay = reconnectDelayMs(reconnectAttempt);
  reconnectAttempt += 1;
  setStatus(status, `Live-Sync getrennt. Neuer Versuch in ${Math.round(delay / 1000)}s.`, "error");

  activeReconnectTimer = setTimeout(() => {
    activeReconnectTimer = null;
    if (selectedChannelId !== channelId || activeMessageSocket) {
      return;
    }

    setStatus(status, "Live-Sync wird neu verbunden.", "loading");
    void loadMessages(root, channelId)
      .then(() => openMessageSocket(root, channelId, status))
      .catch(() => scheduleMessageReconnect(root, channelId, status));
  }, delay);
}

function clearReconnectTimer(): void {
  if (!activeReconnectTimer) {
    return;
  }

  clearTimeout(activeReconnectTimer);
  activeReconnectTimer = null;
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** Math.max(0, attempt), MAX_RECONNECT_DELAY_MS);
}

function parseMessageEnvelope(data: unknown): MessageDispatchEnvelope | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: Partial<MessageDispatchEnvelope>;
  try {
    parsed = JSON.parse(data) as Partial<MessageDispatchEnvelope>;
  } catch {
    return null;
  }
  if (parsed.op !== "DISPATCH" || typeof parsed.t !== "string" || !isMessage(parsed.d)) {
    return null;
  }

  return parsed as MessageDispatchEnvelope;
}

function isMessage(value: unknown): value is Message {
  return (
    Boolean(value && typeof value === "object") &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { channelId?: unknown }).channelId === "string" &&
    typeof (value as { createdAt?: unknown }).createdAt === "string"
  );
}

function messageSocketUrl(channelId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const accessToken = localStorage.getItem("openvoice.accessToken");
  const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
  return `${protocol}//${window.location.host}/api/v1/channels/${encodeURIComponent(
    channelId,
  )}/messages/ws${query}`;
}

function sortMessageList(list: HTMLOListElement): void {
  const items = Array.from(list.children).sort((left, right) =>
    compareMessageElements(left as HTMLElement, right as HTMLElement),
  );
  list.replaceChildren(...items);
}

function compareMessageElements(left: HTMLElement, right: HTMLElement): number {
  return (
    compareIso(left.dataset.createdAt ?? "", right.dataset.createdAt ?? "") ||
    (left.dataset.messageId ?? "").localeCompare(right.dataset.messageId ?? "")
  );
}

function compareMessagesAsc(left: Message, right: Message): number {
  return compareIso(left.createdAt, right.createdAt) || left.id.localeCompare(right.id);
}

function compareIso(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && "escape" in CSS
    ? CSS.escape(value)
    : value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function readCurrentChannelId(): string {
  return selectedChannelId;
}

function csrfHeader(): Record<string, string> {
  const token = localStorage.getItem("openvoice.csrfToken");
  return token ? { "x-openvoice-csrf-token": token } : {};
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("openvoice.accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function setStatus(
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

async function readMessageError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  const message = body?.error?.message;
  return typeof message === "string"
    ? message
    : `Nachricht konnte nicht gesendet werden (${response.status}).`;
}

export function renderMessage(message: Message): string {
  const body = message.deletedAt ? "<em>Gelöscht</em>" : escapeHtml(message.content);
  const edited = message.editedAt ? `<span class="chat-message__edited">bearbeitet</span>` : "";
  const authorName = authorDisplayName(message.authorId);
  const ownClass = currentUserId && message.authorId === currentUserId ? " chat-message--own" : "";

  return `
    <li class="chat-message${ownClass}" data-message-id="${escapeHtml(message.id)}" data-author-id="${escapeHtml(message.authorId)}" data-created-at="${escapeHtml(message.createdAt)}">
      <div class="chat-message__avatar" aria-hidden="true">${escapeHtml(initials(authorName))}</div>
      <div class="chat-message__bubble">
        <div class="chat-message__meta">
          <span class="chat-message__author">${escapeHtml(authorName)}</span>
          <time datetime="${escapeHtml(message.createdAt)}">${formatTime(message.createdAt)}</time>
          ${edited}
        </div>
        <p class="chat-message__body">${body}</p>
      </div>
    </li>
  `;
}

function refreshRenderedAuthors(root: HTMLElement): void {
  const messages = root.querySelectorAll<HTMLElement>(".chat-message");
  for (const message of Array.from(messages)) {
    const authorId = message.dataset.authorId ?? "";
    const authorName = authorDisplayName(authorId);
    const author = message.querySelector(".chat-message__author");
    const avatar = message.querySelector(".chat-message__avatar");
    if (author) {
      author.textContent = authorName;
    }
    if (avatar) {
      avatar.textContent = initials(authorName);
    }
    message.classList.toggle(
      "chat-message--own",
      Boolean(currentUserId && authorId === currentUserId),
    );
  }
}

function rememberLocalDisplayName(): void {
  const displayName = localStorage.getItem("openvoice.displayName");
  if (displayName && currentUserId) {
    rememberChatAuthor(currentUserId, displayName);
  }
}

function rememberLocalAuthor(authorId: string): void {
  currentUserId = currentUserId || authorId;
  const displayName = localStorage.getItem("openvoice.displayName");
  if (displayName) {
    rememberChatAuthor(authorId, displayName);
  }
}

export function rememberChatAuthor(authorId: string, displayName: string): boolean {
  if (!authorId || !displayName || authorNameCache.get(authorId) === displayName) {
    return false;
  }

  authorNameCache.set(authorId, displayName);
  return true;
}

function authorDisplayName(authorId: string): string {
  return authorNameCache.get(authorId) ?? "Teilnehmer";
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "T").slice(0, 2);
  return letters.toUpperCase();
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
