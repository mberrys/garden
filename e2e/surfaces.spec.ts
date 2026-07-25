import { expect, test } from "@playwright/test";
import { newDocument, openEmptyWorkspace, openSeededWorkspace, samplePdfPath } from "./fixtures";

/**
 * End-to-end coverage of each surface's core interaction, run against the
 * scripted mock provider so nothing depends on a local model being installed.
 */

test("seeds a starter workspace on first run", async ({ page }) => {
  await openSeededWorkspace(page);
  const sidebar = page.locator("aside").first();
  await expect(sidebar).toContainText("Welcome to rr");
  await expect(sidebar).toContainText("How an edit flows");
  await expect(page.locator(".rr-prose")).toContainText("four surfaces");
});

test("text: typing persists across a reload", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Document");
  await page.click(".rr-prose");
  await page.keyboard.type("Persistence check.");
  await expect(page.locator(".rr-prose")).toContainText("Persistence check.");

  // Give the debounced write-behind time to reach IndexedDB.
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForSelector(".rr-prose");
  await expect(page.locator(".rr-prose")).toContainText("Persistence check.");
});

test("canvas: drawing a shape and a stroke, then undo", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Canvas");

  const canvas = page.locator('canvas[aria-label="Drawing canvas"]');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;

  await page.click('button[aria-label="Rectangle (R)"]');
  await page.mouse.move(box.x + 200, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 280, { steps: 8 });
  await page.mouse.up();

  // A selected shape shows the inspector, which is how we know it exists.
  await expect(page.getByText("rect", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.click('button[aria-label="Draw (P)"]');
  await page.mouse.move(box.x + 520, box.y + 200);
  await page.mouse.down();
  for (let i = 0; i < 16; i++) {
    await page.mouse.move(box.x + 520 + i * 10, box.y + 200 + Math.sin(i / 2) * 35);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Undo removes the stroke; the rectangle survives.
  await page.click('button[aria-label="Undo"]');
  await page.waitForTimeout(300);
  await page.click('button[aria-label="Select (V)"]');
  await page.mouse.click(box.x + 300, box.y + 220);
  await expect(page.getByText("rect", { exact: true })).toBeVisible();
});

test("deck: adding a slide, then presenting and exiting", async ({ page }) => {
  await openEmptyWorkspace(page);
  await newDocument(page, "Deck");

  await expect(page.getByText("1 / 1")).toBeVisible();
  await page.click('button:has-text("Add slide")');
  await expect(page.getByText("2 / 2")).toBeVisible();

  await page.click('button:has-text("Present")');
  await expect(page.locator('button:has-text("notes (N)")')).toBeVisible();

  // Escape must exit — this regressed once when a sibling key handler's
  // synchronous re-render detached the presenter's listener mid-dispatch.
  await page.keyboard.press("Escape");
  await expect(page.locator('button:has-text("Present")')).toBeVisible();
});

test("pdf: rendering, annotating, and capturing the quoted text", async ({ page }) => {
  await openEmptyWorkspace(page);
  await page.setInputFiles('input[type="file"]', await samplePdfPath());

  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 / 3")).toBeVisible();

  // Highlight exactly over a known sentence and check the quote was captured.
  const target = await page.evaluate(() => {
    const layer = document.querySelector('[data-page="1"] div[aria-hidden]');
    const span = [...(layer?.children ?? [])].find((element) =>
      element.textContent?.includes("migration"),
    );
    if (!span) return null;
    const rect = span.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
  expect(target, "the text layer should expose selectable spans").not.toBeNull();

  await page.click('button[aria-label="Highlight"]');
  await page.mouse.move(target!.x - 4, target!.y + target!.h / 2 - 5);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.w + 4, target!.y + target!.h / 2 + 5, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText("P1 · highlight")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /p1 · highlight/i }),
  ).toContainText("The migration completed");
});
