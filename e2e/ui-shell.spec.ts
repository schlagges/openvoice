import { expect, test, type Page, type TestInfo } from "@playwright/test";

test("workspace shell renders dark and light mode with screenshots", async ({ page }, testInfo) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspaceName = `UI Workspace ${suffix}`;
  const channelName = `ui-general-${suffix}`;

  await page.goto("/");
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

  await page.getByRole("button", { name: "Workspace starten" }).click();
  await expect(page.locator("#onboarding-dialog")).toBeVisible();
  await attachScreenshot(page, testInfo, "openvoice-light-onboarding");
});

async function createWorkspace(
  page: Page,
  workspaceName: string,
  channelName: string,
): Promise<void> {
  await page.getByRole("button", { name: "Workspace starten" }).click();
  await page.locator("#create-display-name").fill("UI Test");
  await page.locator("#create-workspace").fill(workspaceName);
  await page.locator("#create-channel").fill(channelName);
  await page.locator("#create-channel-type").selectOption("text");
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
