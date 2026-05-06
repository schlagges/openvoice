import { MessageContentFormat, MessageEventType, type Message } from "@openvoice/shared";

interface CreateMessageResponse {
  readonly duplicate: boolean;
  readonly message: Message;
}

interface ListMessagesResponse {
  readonly messages: readonly Message[];
}

interface ChannelSelectionDetail {
  readonly channelId: string;
  readonly channelName: string;
  readonly channelType: string;
}

interface MessageDispatchEnvelope {
  readonly d: Message;
  readonly op: "DISPATCH";
  readonly t: string;
}

let selectedChannelId = "";
let activeMessageSocket: WebSocket | null = null;
let activeMessageSocketChannelId = "";

export function renderChatPanel(messages: readonly Message[], channelName = "Nachrichten"): string {
  return `
    <section class="chat-panel" aria-label="Chat">
      <header class="chat-panel__header">
        <div>
          <p class="eyebrow">Text Channel</p>
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
        <textarea id="chat-message-input" class="chat-composer__input" name="message" rows="3"></textarea>
        <p id="chat-composer-status" class="chat-composer__status" role="status"></p>
        <button class="chat-composer__send" type="submit">Nachricht senden</button>
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

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const content = input?.value.trim() ?? "";
    if (!content) {
      setStatus(status, "Nachricht darf nicht leer sein.", "error");
      return;
    }

    const channelId = readCurrentChannelId();
    if (!channelId) {
      setStatus(
        status,
        "Bitte zuerst per Anleitung einen Text- oder Voice-Channel erstellen.",
        "error",
      );
      return;
    }

    void createMessage(channelId, content)
      .then(({ message }) => {
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
      closeMessageSocket();
      setStatus(status, "Voice-Channel ausgewaehlt.", "success");
      return;
    }
    if (detail.channelType !== "text" && detail.channelType !== "combined") {
      closeMessageSocket();
      setStatus(status, "Dieser Channel hat keinen Textverlauf.", "success");
      return;
    }

    setStatus(status, "Nachrichten werden geladen.", "loading");
    void loadMessages(root, detail.channelId)
      .then(() => {
        openMessageSocket(root, detail.channelId, status);
        setStatus(status, "Channel geladen. Live-Sync aktiv.", "success");
      })
      .catch(() => setStatus(status, "Nachrichten konnten nicht geladen werden.", "error"));
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
  });

  if (!response.ok) {
    return;
  }

  const body = (await response.json()) as ListMessagesResponse;
  replaceMessages(root, body.messages);
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

  closeMessageSocket();
  activeMessageSocketChannelId = channelId;
  const socket = new WebSocket(messageSocketUrl(channelId));
  activeMessageSocket = socket;

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
      setStatus(status, "Live-Sync getrennt. Channel erneut anklicken.", "error");
    }
  });
}

function closeMessageSocket(): void {
  const socket = activeMessageSocket;
  activeMessageSocket = null;
  activeMessageSocketChannelId = "";
  socket?.close();
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
  return `${protocol}//${window.location.host}/api/v1/channels/${encodeURIComponent(
    channelId,
  )}/messages/ws`;
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

  return `
    <li class="chat-message" data-message-id="${escapeHtml(message.id)}" data-created-at="${escapeHtml(message.createdAt)}">
      <div class="chat-message__meta">
        <span class="chat-message__author">${escapeHtml(message.authorId)}</span>
        <time datetime="${escapeHtml(message.createdAt)}">${formatTime(message.createdAt)}</time>
        ${edited}
      </div>
      <p class="chat-message__body">${body}</p>
    </li>
  `;
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
