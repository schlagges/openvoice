import { ChannelType, type ChannelTreeNode } from "@openvoice/shared";

export function renderChannelTree(nodes: readonly ChannelTreeNode[]): string {
  if (nodes.length === 0) {
    return `<p class="channel-tree__empty"><strong>Noch keine sichtbaren Channels.</strong><span>Schnellstart erstellt einen Combined-Channel fuer Chat und Voice.</span></p>`;
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

  return `<li class="channel-tree__item" data-channel-id="${escapeHtml(node.id)}" data-channel-name="${escapeHtml(
    node.name,
  )}" data-channel-type="${escapeHtml(
    node.type,
  )}"><button class="channel-tree__label" type="button"><span class="channel-tree__kind">${escapeHtml(
    typeLabel(node.type),
  )}</span>${escapeHtml(node.name)}</button>${childList}</li>`;
}

function typeLabel(type: ChannelTreeNode["type"]): string {
  switch (type) {
    case ChannelType.CATEGORY:
      return "CAT";
    case ChannelType.COMBINED:
      return "TXT+VOICE";
    case ChannelType.TEXT:
      return "TXT";
    case ChannelType.VOICE:
      return "VOICE";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
