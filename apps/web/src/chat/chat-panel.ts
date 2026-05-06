import { MessageContentFormat, type Message } from "@openvoice/shared";

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
          : `<ol class="chat-messages">${messages.map(renderMessage).join("")}</ol>`
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
  root.innerHTML = renderChatPanel(messages);
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
        appendMessage(root, message);
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
    updateChatTitle(root, detail.channelName);
    if (detail.channelType === "voice") {
      setStatus(status, "Voice-Channel ausgewaehlt. Per Doppelklick Voice beitreten.", "success");
      return;
    }
    if (detail.channelType !== "text" && detail.channelType !== "combined") {
      setStatus(status, "Dieser Channel hat keinen Textverlauf.", "success");
      return;
    }

    setStatus(status, "Nachrichten werden geladen.", "loading");
    void loadMessages(root, detail.channelId)
      .then(() => setStatus(status, "Channel geladen.", "success"))
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

function appendMessage(root: HTMLElement, message: Message): void {
  const list = ensureMessageList(root);
  list.insertAdjacentHTML("beforeend", renderMessage(message));
  list.scrollTop = list.scrollHeight;
  updateMessageCount(root, list.children.length);
}

function replaceMessages(root: HTMLElement, messages: readonly Message[]): void {
  const list = ensureMessageList(root);
  list.innerHTML = messages.map(renderMessage).join("");
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

function readCurrentChannelId(): string {
  return document.querySelector<HTMLInputElement>("#voice-channel-id")?.value.trim() ?? "";
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
    <li class="chat-message" data-message-id="${escapeHtml(message.id)}">
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
