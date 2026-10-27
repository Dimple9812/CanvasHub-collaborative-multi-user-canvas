import { expect, test, type Browser, type Page } from "@playwright/test";

const shapeCount = (page: Page) => page.locator("[data-shape-count]").getAttribute("data-shape-count").then(Number);

async function startAsGuest(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Try a board/ }).click();
  await page.waitForURL(/\/b\//);
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
}

async function shareLink(page: Page, kind: "Can edit" | "View only") {
  await page.getByRole("button", { name: "Share" }).click();
  const url = await page.getByLabel(kind).inputValue();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return new URL(url).pathname;
}

async function openAsSecondGuest(browser: Browser, path: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  await page.waitForURL(/\/login/);
  await page.getByRole("button", { name: "Continue as a guest" }).click();
  await page.waitForURL(/\/b\//);
  await expect(page.getByRole("status").filter({ hasText: /Live/ })).toBeVisible();
  return page;
}

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  await page.keyboard.press("r");
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 6 });
  await page.mouse.up();
}

test("a new guest lands on a starter board", async ({ page }) => {
  await startAsGuest(page);
  await expect(page.getByRole("heading", { name: "Welcome board" })).toBeAttached();
  await expect.poll(() => shapeCount(page)).toBe(8);
});

test("two people see each other's shapes, text and cursors live", async ({ page, browser }) => {
  await startAsGuest(page);
  const other = await openAsSecondGuest(browser, await shareLink(page, "Can edit"));

  await drawRect(page, [1000, 640], [1180, 740]);
  await expect.poll(() => shapeCount(other)).toBe(9);

  await other.keyboard.press("s");
  await other.mouse.click(1050, 160);
  await other.waitForTimeout(100);
  await other.keyboard.type("Ship it");
  await other.keyboard.press("Escape");
  await expect.poll(() => shapeCount(page)).toBe(10);

  await other.mouse.move(600, 600);
  await other.mouse.move(620, 610, { steps: 3 });
  await expect(page.locator("text=Guest").filter({ hasNotText: "you" }).first()).toBeVisible();
});

test("undo only reverts your own edit", async ({ page, browser }) => {
  await startAsGuest(page);
  const other = await openAsSecondGuest(browser, await shareLink(page, "Can edit"));

  await drawRect(other, [900, 600], [1000, 700]); // theirs
  await expect.poll(() => shapeCount(page)).toBe(9);
  await drawRect(page, [1000, 120], [1150, 200]); // mine
  await expect.poll(() => shapeCount(other)).toBe(10);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => shapeCount(page)).toBe(9);
  await expect.poll(() => shapeCount(other)).toBe(9); // their rectangle is still there
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => shapeCount(other)).toBe(10);
});

test("edits made offline sync after reconnecting", async ({ page, browser }) => {
  await startAsGuest(page);
  const other = await openAsSecondGuest(browser, await shareLink(page, "Can edit"));

  await page.context().setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: /Offline|Reconnecting/ })).toBeVisible();
  await drawRect(page, [1000, 640], [1150, 740]);
  await drawRect(page, [1000, 120], [1150, 200]);
  expect(await shapeCount(page)).toBe(10);
  expect(await shapeCount(other)).toBe(8);

  await page.context().setOffline(false);
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => shapeCount(other), { timeout: 10_000 }).toBe(10);
});

test("view-only links can look but not draw", async ({ page, browser }) => {
  await startAsGuest(page);
  const viewer = await openAsSecondGuest(browser, await shareLink(page, "View only"));
  await expect(viewer.getByText("View only")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /Rectangle/ })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Share" })).toHaveCount(0);

  await viewer.keyboard.press("r");
  await viewer.mouse.move(900, 600);
  await viewer.mouse.down();
  await viewer.mouse.move(1000, 700, { steps: 4 });
  await viewer.mouse.up();
  await viewer.waitForTimeout(400);
  expect(await shapeCount(viewer)).toBe(8);
  expect(await shapeCount(page)).toBe(8);
});

test("save a version and restore it", async ({ page }) => {
  await startAsGuest(page);
  await page.getByRole("button", { name: "Versions" }).click();
  await page.getByLabel("Version name").fill("Starter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Starter")).toBeVisible();

  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect.poll(() => shapeCount(page)).toBe(0);

  await page.getByRole("button", { name: "Restore" }).click();
  await expect.poll(() => shapeCount(page)).toBe(8);
});

test("exports the board as a PNG", async ({ page }) => {
  await startAsGuest(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as PNG" }).click();
  expect((await download).suggestedFilename()).toBe("Welcome board.png");
});
