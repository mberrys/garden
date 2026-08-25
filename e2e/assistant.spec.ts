import { expect, test } from "@playwright/test";
import { newDocument, openEmptyWorkspace, samplePdfPath } from "./fixtures";

/**
 * The review gate is the app's central promise: an AI-proposed change is
 * visible before it lands, discarding it costs nothing, and accepting it is an
 * ordinary undoable edit. These tests hold that promise to account.
 */

test("the header says plainly that replies are scripted", async ({ page }) => {
  await openEmptyWorkspace(page);
  await expect(page.getByText("mock provider")).toBeVisible();
});

test("a suggestion is previewed, and discarding leaves the document untouched", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Document");
  const editor = page.locator(".garden-markdown");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.click();
  await page.keyboard.type("An original sentence.");

  await page.click('button:has-text("Add an outline")');
  await expect(page.getByText("proposed change", { exact: false })).toBeVisible({ timeout: 30_000 });

  // Nothing may have changed yet.
  await expect(editor).not.toContainText("Outline");

  await page.click('button:has-text("Discard")');
  await expect(page.getByText("Discarded")).toBeVisible();
  await expect(editor).not.toContainText("Outline");
  await expect(editor).toContainText("An original sentence.");
});

test("accepting applies the change, and ctrl+Z undoes it", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Document");
  const editor = page.locator(".garden-markdown");
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await editor.click();
  await page.keyboard.type("An original sentence.");

  await page.click('button:has-text("Add an outline")');
  await expect(page.getByText("proposed change", { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.click('button:has-text("Apply")');

  await expect(page.getByText("Applied 1 change", { exact: true })).toBeVisible();
  await expect(editor).toContainText("Outline");

  // An AI edit undoes like any other edit.
  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor).not.toContainText("Outline");
  await expect(editor).toContainText("An original sentence.");
});

test("a canvas suggestion adds shapes and connectors", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Canvas");

  await page.click('button:has-text("Tidy the layout")');
  await expect(page.getByText("proposed change", { exact: false })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("aside").last();
  await expect(card).toContainText("Add rect");
  await expect(card).toContainText("Add connector");

  await page.click('button:has-text("Apply")');
  await expect(page.getByText(/^Applied \d+ changes?$/)).toBeVisible();

  // Undo from the toolbar reverses the whole batch as one step.
  await page.click('button[aria-label="Undo"]');
  await page.waitForTimeout(400);
  await expect(page.getByText("Pick a tool and draw")).toBeVisible();
});

test("a sheet suggestion fills cells, and undo clears them", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Sheet");

  await page.click('button:has-text("Add totals")');
  await expect(page.getByText("proposed change", { exact: false })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("aside").last();
  await expect(card).toContainText("cell");

  await page.click('button:has-text("Apply")');
  await expect(page.getByText(/^Applied \d+ changes?$/)).toBeVisible();

  // The scripted reply fills a short numeric column and totals it with SUM.
  await expect(page.locator('[aria-label="A4"]')).toContainText("60");

  await page.click('button[aria-label="Undo"]');
  await expect(page.locator('[aria-label="A4"]')).toContainText("");
});

test("a PDF builds a deck into the second pane", async ({ page }) => {
  await openEmptyWorkspace(page);
  await page.setInputFiles('input[type="file"]', await samplePdfPath());
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });

  // Let a page or two extract their text, which is what the recipe reads.
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Build a deck")');

  // The target deck is created and opened beside the source.
  await expect(page.locator("aside").first()).toContainText("review — deck");
  await expect(page.getByText("proposed change", { exact: false })).toBeVisible({ timeout: 30_000 });

  const card = page.locator("aside").last();
  await expect(card).toContainText("slide");

  await page.click('button:has-text("Apply")');
  await expect(page.getByText(/^Applied \d+ changes?$/)).toBeVisible();

  // The deck pane now holds the generated slides.
  await expect(page.getByText(/^1 \/ [2-9]\d*$/)).toBeVisible();
});

test("prompt-to-surface discard leaves no mini-tool; accept plants one", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Document");
  await page.getByRole("button", { name: "Propose a mini-tool" }).click();
  await expect(page.getByText("Propose mini-tool:")).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.locator("aside").first()).not.toContainText("Proposed mini-tool");

  await page.getByRole("button", { name: "Propose a mini-tool" }).click();
  await page.getByRole("button", { name: "Apply transaction" }).click();
  await expect(page.locator("aside").first()).toContainText("Proposed mini-tool");
});
