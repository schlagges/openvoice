import { type ChannelNode, type ChannelTreeNode } from "./types.js";

export function buildChannelTree(nodes: readonly ChannelNode[]): readonly ChannelTreeNode[] {
  const childrenByParent = new Map<string | null, ChannelNode[]>();

  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(
      (left, right) => left.position - right.position || left.name.localeCompare(right.name),
    );
  }

  const build = (parentId: string | null): ChannelTreeNode[] =>
    (childrenByParent.get(parentId) ?? []).map((node) => ({
      ...node,
      children: build(node.id),
    }));

  return build(null);
}

export function flattenChannelTree(nodes: readonly ChannelTreeNode[]): readonly ChannelNode[] {
  const flattened: ChannelNode[] = [];

  const visit = (node: ChannelTreeNode): void => {
    flattened.push({
      createdAt: node.createdAt,
      depth: node.depth,
      id: node.id,
      inheritsPermissions: node.inheritsPermissions,
      isArchived: node.isArchived,
      name: node.name,
      parentId: node.parentId,
      path: node.path,
      position: node.position,
      slug: node.slug,
      type: node.type,
      updatedAt: node.updatedAt,
      workspaceId: node.workspaceId,
    });
    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return flattened;
}
