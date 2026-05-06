import { expect, test, type Page, type TestInfo } from "@playwright/test";

test("workspace shell renders dark and light mode with screenshots", async ({ page }, testInfo) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `UI Workspace ${suffix}`;
  const channelName = `ui-general-${suffix}`;

  await page.goto(`/?e2e=${suffix}`);
  await createWorkspace(page, workspaceName, channelName);

  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(workspaceName) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(channelName) })).toBeVisible();
  await expect(page.locator(".chat-panel")).toBeVisible();
  await expect(page.locator(".voice-panel")).toBeVisible();

  await attachScreenshot(page, testInfo, "openvoice-dark-shell");

  await page.getByRole("button", { name: /Light Mode einschalten/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".chat-column")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".channel-sidebar")).toHaveCSS(
    "background-color",
    "rgb(248, 250, 252)",
  );
  await attachScreenshot(page, testInfo, "openvoice-light-shell");

  const footerQr = page.locator(".sidebar-footer .desktop-qr");
  await expect(footerQr).toBeAttached();
  if ((page.viewportSize()?.width ?? 0) >= 900) {
    await expect(footerQr).toBeVisible();
  }
  await expect(page.locator(".workspace-topbar .desktop-qr")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Logout|Abmelden/ })).toBeVisible();

  await page.locator('button[data-stage-mode="focus"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-stage-mode", "focus");
  await page.locator('button[data-stage-mode="grid"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-stage-mode", "grid");

  await page.locator('button[data-ui-preference="chatVisibility"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-chat-visibility", "hidden");
  await page.locator('button[data-ui-preference="chatVisibility"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-chat-visibility", "docked");

  await page.locator('button[data-ui-preference="channelVisibility"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-channel-visibility", "hidden");
  await page.locator('button[data-ui-preference="channelVisibility"]').click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-channel-visibility", "docked");

  await page.getByRole("button", { name: "Einladen" }).click();
  await expect(page.locator("#invite-dialog")).toBeVisible();
  await attachScreenshot(page, testInfo, "openvoice-light-invite");
});

test("workspace navigation keeps creation controls out of the workspace header", async ({
  page,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `Navigation Workspace ${suffix}`;
  const channelName = `navigation-general-${suffix}`;

  await page.goto(`/?e2e=${suffix}`);
  await createWorkspace(page, workspaceName, channelName);

  await expect(page.locator(".workspace-switcher__header [data-open-onboarding]")).toHaveCount(0);
  await expect(page.locator(".workspace-switcher__header #workspace-refresh")).toHaveCount(0);
  await expect(page.locator(".sidebar-footer #invite-dialog-open")).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(workspaceName) })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(channelName) })).toBeVisible();
});

test("mobile shell renders current controls without stale cache", async ({ page }, testInfo) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `Mobile Workspace ${suffix}`;
  const channelName = `mobile-general-${suffix}`;

  await page.goto(`/?mobile-e2e=${suffix}`);
  await createWorkspace(page, workspaceName, channelName);

  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("#voice-audio-codec")).toBeAttached();
  await expect(page.locator("#voice-connection-stats")).toBeAttached();
  await expect(page.locator(".chat-emoji-set")).toBeVisible();
  await attachScreenshot(page, testInfo, "openvoice-mobile-shell");
});

async function createWorkspace(
  page: Page,
  workspaceName: string,
  channelName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Workspace erstellen" }).click();
  await page.locator("#create-workspace").fill(workspaceName);
  await page.locator("#create-channel").fill(channelName);
  await page
    .locator("#onboarding-dialog")
    .getByRole("button", { name: "Workspace erstellen" })
    .click();
  await expect(page.locator("#onboarding-dialog")).not.toBeVisible();
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}
