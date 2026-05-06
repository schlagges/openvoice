import { expect, test, type Page } from "@playwright/test";

const siteUser = process.env.OPENVOICE_E2E_SITE_USER ?? "openvoice";
const sitePassword = process.env.OPENVOICE_E2E_SITE_PASSWORD ?? "keins";

test("two browser contexts can join one workspace and sync chat messages", async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `E2E Workspace ${suffix}`;
  const channelName = `e2e-general-${suffix}`;
  const password = "very-secure-password";

  const ownerContext = await browser.newContext({
    httpCredentials: { password: sitePassword, username: siteUser },
  });
  const memberContext = await browser.newContext({
    httpCredentials: { password: sitePassword, username: siteUser },
  });
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();

  await owner.goto("/");
  await owner.getByRole("button", { name: "Testnutzer" }).click();
  await owner.locator("#quick-email").fill(`owner-${suffix}@example.com`);
  await owner.locator("#quick-password").fill(password);
  await owner.locator("#quick-display-name").fill("Owner Test");
  await owner.locator("#quick-workspace").fill(workspaceName);
  await owner.locator("#quick-channel").fill(channelName);
  await owner.locator("#quick-channel-type").selectOption("text");
  await owner.getByRole("button", { name: "Testnutzer erstellen" }).click();

  await expect(owner.locator("#test-user-dialog")).not.toBeVisible();
  await expect(owner.getByRole("button", { name: new RegExp(channelName) })).toBeVisible();

  await owner.getByRole("button", { name: "Testnutzer" }).click();
  await owner.getByRole("button", { name: "Invite erstellen" }).click();
  await expect(owner.locator("#invite-code")).toHaveValue(/^[A-Za-z0-9_-]{16,64}$/);
  const inviteCode = await owner.locator("#invite-code").inputValue();
  await owner.locator("#test-user-dialog-close").click();

  await member.goto("/");
  await registerCurrentBrowserSession(member, `member-${suffix}@example.com`, password);
  await member.getByRole("button", { name: "Testnutzer" }).click();
  await member.locator("#invite-code").fill(inviteCode);
  await member.getByRole("button", { name: "Invite beitreten" }).click();

  await expect(member.locator("#test-user-dialog")).not.toBeVisible();
  await expect(member.getByRole("button", { name: new RegExp(workspaceName) })).toBeVisible();
  await expect(member.getByRole("button", { name: new RegExp(channelName) })).toBeVisible();

  await owner.getByRole("button", { name: new RegExp(channelName) }).click();
  await member.getByRole("button", { name: new RegExp(channelName) }).click();

  const ownerMessage = `Owner message ${suffix}`;
  const memberMessage = `Member message ${suffix}`;
  await sendMessage(owner, ownerMessage);
  await expect(member.locator(".chat-message__body", { hasText: ownerMessage })).toBeVisible();

  await sendMessage(member, memberMessage);
  await expect(owner.locator(".chat-message__body", { hasText: memberMessage })).toBeVisible();

  await expectChronologicalMessages(owner, [ownerMessage, memberMessage]);
  await expectChronologicalMessages(member, [ownerMessage, memberMessage]);

  await ownerContext.close();
  await memberContext.close();
});

async function registerCurrentBrowserSession(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.evaluate(
    async ({ email: registerEmail, password: registerPassword }) => {
      localStorage.removeItem("openvoice.csrfToken");
      const response = await fetch("/api/v1/auth/register", {
        body: JSON.stringify({
          displayName: "Member Test",
          email: registerEmail,
          password: registerPassword,
        }),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Register failed with ${response.status}`);
      }
      const session = (await response.json()) as { csrfToken: string };
      localStorage.setItem("openvoice.csrfToken", session.csrfToken);
    },
    { email, password },
  );
}

async function sendMessage(page: Page, message: string): Promise<void> {
  await page.locator("#chat-message-input").fill(message);
  await page.getByRole("button", { name: "Nachricht senden" }).click();
  await expect(page.locator(".chat-message__body", { hasText: message })).toBeVisible();
}

async function expectChronologicalMessages(page: Page, messages: readonly string[]): Promise<void> {
  const texts = await page.locator(".chat-message__body").allTextContents();
  const positions = messages.map((message) => texts.findIndex((text) => text.includes(message)));

  for (const position of positions) {
    expect(position).toBeGreaterThanOrEqual(0);
  }
  expect([...positions].sort((left, right) => left - right)).toEqual(positions);
}
