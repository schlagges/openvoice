import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("release documentation gates", () => {
  it("keeps v0.1.0 release readiness free of open P0 gaps", () => {
    const readiness = readFileSync("docs/release-readiness-v0.1.0-rc1.md", "utf8");
    const audit = readFileSync("docs/audit/security-permissions-rtc-audit.md", "utf8");

    expect(readiness).toContain("Keine offenen P0-Punkte fuer den API-/Backend-RC-Scope.");
    expect(readiness).not.toContain("| P0");
    expect(audit).toContain("P0-1: behoben");
    expect(audit).toContain("P0-2: behoben");
    expect(audit).toContain("P0-3: behoben");
  });

  it("marks API endpoints that are documented but not implemented in rc1", () => {
    const api = readFileSync("docs/api.md", "utf8");

    for (const endpoint of [
      "POST /api/v1/auth/password-reset/request",
      "POST /api/v1/auth/password-reset/confirm",
      "PATCH  /api/v1/workspaces/:workspaceId",
      "DELETE /api/v1/workspaces/:workspaceId",
      "GET    /api/v1/channels/:channelId",
      "PATCH  /api/v1/channels/:channelId",
      "DELETE /api/v1/channels/:channelId",
      "GET    /api/v1/workspaces/:workspaceId/roles",
      "POST   /api/v1/workspaces/:workspaceId/roles",
      "PUT    /api/v1/workspaces/:workspaceId/members/:userId/roles/:roleId",
    ]) {
      expect(api).toContain(`${endpoint} (nicht in v0.1.0-rc1)`);
    }
  });
});
