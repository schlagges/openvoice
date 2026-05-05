import { OPENVOICE_PHASE } from "@openvoice/shared";

import { mountChatPanel } from "./chat/chat-panel.js";
import { mountChannelTree } from "./channels/channel-tree.js";
import { mountAuditLog } from "./moderation/audit-log.js";
import { mountVoiceControls } from "./voice/voice-client.js";

export function formatWebTitle(phase: typeof OPENVOICE_PHASE): string {
  return `OpenVoice Phase ${phase}`;
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
      </aside>
      <section id="workspace-panel" class="workspace-panel" aria-label="Workspace"></section>
    </main>
  `;

  const channelTree = app.querySelector<HTMLElement>("#channel-tree");
  if (channelTree) {
    mountChannelTree(channelTree, []);
  }

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
