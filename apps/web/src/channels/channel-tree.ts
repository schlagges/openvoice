import { ChannelType, type ChannelTreeNode } from "@openvoice/shared";

export function renderChannelTree(nodes: readonly ChannelTreeNode[]): string {
  if (nodes.length === 0) {
    return `<p class="channel-tree__empty"><strong>Noch keine Channels.</strong><span>Starte einen Workspace oder tritt einem bestehenden bei.</span></p>`;
  }

  return `<ol class="channel-tree__list">${nodes.map(renderNode).join("")}</ol>`;
}

export function mountChannelTree(
  root: Pick<HTMLElement, "innerHTML">,
  nodes: readonly ChannelTreeNode[],
): void {
  root.innerHTML = renderChannelTree(nodes);
}

function renderNode(node: ChannelTreeNode): string {
  const childList =
    node.children.length > 0
      ? `<ol class="channel-tree__list channel-tree__list--nested">${node.children
          .map(renderNode)
          .join("")}</ol>`
      : "";
  const isCategory = node.type === ChannelType.CATEGORY;

  return `
    <li class="channel-tree__item${isCategory ? " is-category" : ""}" data-channel-id="${escapeHtml(
      node.id,
    )}" data-channel-name="${escapeHtml(node.name)}" data-channel-type="${escapeHtml(node.type)}">
      <button class="channel-tree__label" type="button" ${isCategory ? "disabled" : ""}>
        <span class="channel-tree__icon" aria-hidden="true">${escapeHtml(typeIcon(node.type))}</span>
        <span class="channel-tree__content">
          <span class="channel-tree__name">${escapeHtml(node.name)}</span>
          <span class="channel-tree__badge">${escapeHtml(typeLabel(node.type))}</span>
        </span>
        <span class="channel-tree__count" title="Teilnehmer im aktiven Voice Channel">-</span>
      </button>
      ${childList}
    </li>
  `;
}

function typeIcon(type: ChannelTreeNode["type"]): string {
  switch (type) {
    case ChannelType.CATEGORY:
      return "⌁";
    case ChannelType.COMBINED:
      return "#◉";
    case ChannelType.TEXT:
      return "#";
    case ChannelType.VOICE:
      return "◉";
  }
}

function typeLabel(type: ChannelTreeNode["type"]): string {
  switch (type) {
    case ChannelType.CATEGORY:
      return "Kategorie";
    case ChannelType.COMBINED:
      return "Chat + Voice";
    case ChannelType.TEXT:
      return "Chat";
    case ChannelType.VOICE:
      return "Voice";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
