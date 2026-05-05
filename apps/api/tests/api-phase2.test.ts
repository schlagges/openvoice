import { randomUUID } from "node:crypto";

import { Permission, serializePermissionMask, type ChannelTreeNode } from "@openvoice/shared";
import { describe, expect, it } from "vitest";

import { InMemoryOpenVoiceRepository } from "../src/db/in-memory-repository.js";
import { createApiHandler } from "../src/http/app.js";
import { AuthService, type PublicUser } from "../src/modules/auth/service.js";
import { ChannelService } from "../src/modules/channels/service.js";
import { InMemoryMessageEventHub } from "../src/modules/messages/events.js";
import { MessageService } from "../src/modules/messages/service.js";
import { WorkspaceService } from "../src/modules/workspaces/service.js";
import type { PasswordHasher } from "../src/security/password.js";

class TestPasswordHasher implements PasswordHasher {
  public async hashPassword(password: string): Promise<string> {
    return `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }

  public async verifyPassword(hash: string, password: string): Promise<boolean> {
    return hash === `$argon2id$test$${Buffer.from(password).toString("base64url")}`;
  }
}

interface TestApp {
  readonly handler: (request: Request) => Promise<Response>;
  readonly repository: InMemoryOpenVoiceRepository;
}

interface TestSession {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly user: PublicUser;
}

interface TestWorkspace {
  readonly id: string;
}

describe("Phase 2 channel API", () => {
  it("creates categories and channels, returns only visible nodes, and applies member overrides", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const member = await register(app, "member@example.com");
    const memberRole = addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    const category = await createChannel(app, owner, workspace.id, {
      name: "General",
      type: "category",
    });
    const text = await createChannel(app, owner, workspace.id, {
      name: "Town Square",
      parentId: category.id,
      type: "text",
    });

    const invalidChild = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/channels`,
        {
          name: "Invalid",
          parentId: text.id,
          type: "voice",
        },
        authHeaders(owner),
      ),
    );
    expect(invalidChild.status).toBe(400);

    await putOverride(app, owner, text.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.VIEW_CHANNEL),
    });

    const hiddenTree = await getTree(app, member, workspace.id);
    expect(flattenNames(hiddenTree)).toEqual(["General"]);

    await putOverride(app, owner, text.id, "member", member.user.id, {
      allow: serializePermissionMask(Permission.VIEW_CHANNEL),
      deny: "0",
    });

    const visibleTree = await getTree(app, member, workspace.id);
    expect(flattenNames(visibleTree)).toEqual(["General", "Town Square"]);

    const hiddenCategory = await createChannel(app, owner, workspace.id, {
      name: "Hidden",
      type: "category",
    });
    const visibleChildBelowHiddenParent = await createChannel(app, owner, workspace.id, {
      name: "Secret Text",
      parentId: hiddenCategory.id,
      type: "text",
    });
    await putOverride(app, owner, hiddenCategory.id, "role", memberRole.id, {
      allow: "0",
      deny: serializePermissionMask(Permission.VIEW_CHANNEL),
    });
    await putOverride(app, owner, visibleChildBelowHiddenParent.id, "member", member.user.id, {
      allow: serializePermissionMask(Permission.VIEW_CHANNEL),
      deny: "0",
    });

    const sanitizedTree = await getTree(app, member, workspace.id);
    const sanitizedChild = sanitizedTree.find(
      (node) => node.id === visibleChildBelowHiddenParent.id,
    );
    expect(sanitizedChild?.parentId).toBeNull();
    expect(sanitizedChild?.path).toBe(visibleChildBelowHiddenParent.id);

    const effectiveResponse = await app.handler(
      new Request(`http://local.test/api/v1/channels/${text.id}/effective-permissions/me`, {
        headers: {
          cookie: member.cookie,
        },
      }),
    );
    const effective = (await effectiveResponse.json()) as { permissions: string };
    expect(
      (BigInt(effective.permissions) & Permission.VIEW_CHANNEL) === Permission.VIEW_CHANNEL,
    ).toBe(true);
  });

  it("rejects non-managers and invalid reorder cycles server-side", async () => {
    const app = createTestApp();
    const owner = await register(app, "owner@example.com");
    const workspace = await createWorkspace(app, owner);
    const member = await register(app, "member@example.com");
    addWorkspaceMember(app.repository, workspace.id, member.user.id, "member");

    const unauthorizedCreate = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/channels`,
        {
          name: "Not Allowed",
          type: "category",
        },
        authHeaders(member),
      ),
    );
    expect(unauthorizedCreate.status).toBe(403);

    const parent = await createChannel(app, owner, workspace.id, {
      name: "Parent",
      type: "category",
    });
    const child = await createChannel(app, owner, workspace.id, {
      name: "Child",
      parentId: parent.id,
      type: "category",
    });

    const reorderResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/channels/reorder`,
        {
          moves: [
            {
              channelId: child.id,
              parentId: null,
              position: 1,
            },
          ],
        },
        authHeaders(owner),
      ),
    );
    const reorderBody = (await reorderResponse.json()) as {
      channels: Array<{ depth: number; id: string; parentId: string | null; path: string }>;
    };
    const movedChild = reorderBody.channels.find((channel) => channel.id === child.id);
    expect(reorderResponse.status).toBe(200);
    expect(movedChild?.parentId).toBeNull();
    expect(movedChild?.depth).toBe(0);
    expect(movedChild?.path).toBe(child.id);

    const cycleParent = await createChannel(app, owner, workspace.id, {
      name: "Cycle Parent",
      type: "category",
    });
    const cycleChild = await createChannel(app, owner, workspace.id, {
      name: "Cycle Child",
      parentId: cycleParent.id,
      type: "category",
    });
    const cycleResponse = await app.handler(
      jsonRequest(
        `/api/v1/workspaces/${workspace.id}/channels/reorder`,
        {
          moves: [
            {
              channelId: cycleParent.id,
              parentId: cycleChild.id,
              position: 0,
            },
          ],
        },
        authHeaders(owner),
      ),
    );
    expect(cycleResponse.status).toBe(400);
  });
});

function createTestApp(): TestApp {
  const repository = new InMemoryOpenVoiceRepository();
  const authService = new AuthService({
    csrfSecret: "test-csrf-secret",
    passwordHasher: new TestPasswordHasher(),
    repository,
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 3600,
  });
  const channelService = new ChannelService({ repository });
  const messageService = new MessageService({
    channelService,
    eventPublisher: new InMemoryMessageEventHub(),
    repository,
  });
  const workspaceService = new WorkspaceService({ repository });
  const handler = createApiHandler({
    authService,
    channelService,
    config: {
      sessionCookieName: "openvoice_session",
      sessionCookieSecure: false,
      sessionTtlSeconds: 3600,
    },
    messageService,
    workspaceService,
  });

  return { handler, repository };
}

async function register(app: TestApp, email: string): Promise<TestSession> {
  const response = await app.handler(
    jsonRequest("/api/v1/auth/register", {
      email,
      password: "very-secure-password",
    }),
  );
  const body = (await response.json()) as { csrfToken: string; user: PublicUser };

  return {
    cookie: response.headers.get("set-cookie") ?? "",
    csrfToken: body.csrfToken,
    user: body.user,
  };
}

async function createWorkspace(app: TestApp, session: TestSession): Promise<TestWorkspace> {
  const response = await app.handler(
    jsonRequest("/api/v1/workspaces", { name: "OpenVoice Test" }, authHeaders(session)),
  );
  const body = (await response.json()) as { workspace: TestWorkspace };

  return body.workspace;
}

async function createChannel(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
  body: { readonly name: string; readonly parentId?: string; readonly type: string },
): Promise<{ readonly id: string }> {
  const response = await app.handler(
    jsonRequest(`/api/v1/workspaces/${workspaceId}/channels`, body, authHeaders(session)),
  );
  const responseBody = (await response.json()) as { channel: { id: string } };

  expect(response.status).toBe(201);
  return responseBody.channel;
}

async function getTree(
  app: TestApp,
  session: TestSession,
  workspaceId: string,
): Promise<readonly ChannelTreeNode[]> {
  const response = await app.handler(
    new Request(`http://local.test/api/v1/workspaces/${workspaceId}/tree`, {
      headers: {
        cookie: session.cookie,
      },
    }),
  );
  const body = (await response.json()) as { channels: readonly ChannelTreeNode[] };

  expect(response.status).toBe(200);
  return body.channels;
}

async function putOverride(
  app: TestApp,
  session: TestSession,
  channelId: string,
  targetType: "member" | "role",
  targetId: string,
  body: { readonly allow: string; readonly deny: string },
): Promise<void> {
  const response = await app.handler(
    new Request(
      `http://local.test/api/v1/channels/${channelId}/permission-overrides/${targetType}/${targetId}`,
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...authHeaders(session),
        },
        method: "PUT",
      },
    ),
  );

  expect(response.status).toBe(200);
}

function addWorkspaceMember(
  repository: InMemoryOpenVoiceRepository,
  workspaceId: string,
  userId: string,
  roleKey: string,
) {
  const role = repository.roles.find(
    (candidate) => candidate.workspaceId === workspaceId && candidate.key === roleKey,
  );
  if (!role) {
    throw new Error(`Expected ${roleKey} role.`);
  }

  const member = {
    createdAt: new Date(),
    id: randomUUID(),
    userId,
    workspaceId,
  };

  repository.workspaceMembers.push(member);
  repository.memberRoles.push({ roleId: role.id, workspaceMemberId: member.id });
  return role;
}

function flattenNames(nodes: readonly ChannelTreeNode[]): string[] {
  return nodes.flatMap((node) => [node.name, ...flattenNames(node.children)]);
}

function authHeaders(session: TestSession): HeadersInit {
  return {
    cookie: session.cookie,
    "x-openvoice-csrf-token": session.csrfToken,
  };
}

function jsonRequest(path: string, body: unknown, headers?: HeadersInit): Request {
  return new Request(`http://local.test${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}
