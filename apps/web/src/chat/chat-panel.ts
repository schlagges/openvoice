import { type Message } from "@openvoice/shared";

export function renderChatPanel(messages: readonly Message[]): string {
  return `
    <section class="chat-panel" aria-label="Chat">
      <ol class="chat-messages">${messages.map(renderMessage).join("")}</ol>
      <form class="chat-composer">
        <label class="chat-composer__label" for="chat-message-input">Nachricht</label>
        <textarea id="chat-message-input" class="chat-composer__input" name="message" rows="3"></textarea>
        <button class="chat-composer__send" type="submit">Senden</button>
      </form>
    </section>
  `;
}

export function mountChatPanel(
  root: Pick<HTMLElement, "innerHTML">,
  messages: readonly Message[],
): void {
  root.innerHTML = renderChatPanel(messages);
}

function renderMessage(message: Message): string {
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
