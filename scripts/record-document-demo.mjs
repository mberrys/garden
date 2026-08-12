import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.GARDEN_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

mkdirSync(ARTIFACTS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1500, height: 950 },
  recordVideo: {
    dir: ARTIFACTS_DIR,
    size: { width: 1500, height: 950 },
  },
});

const page = await context.newPage();

await page.goto(BASE_URL);
await page.waitForSelector('button[aria-label="New document"]', { timeout: 30_000 });

// Let the seeded workspace settle so the sidebar and first document are visible.
await page.waitForTimeout(1200);

// Open the welcome document from the sidebar.
await page.getByRole("button", { name: "Welcome to garden" }).first().click();
await page.waitForSelector(".garden-prose", { timeout: 15_000 });
await page.waitForTimeout(800);

// Focus the editor and type a short paragraph.
await page.click(".garden-prose");
await page.waitForTimeout(400);
await page.keyboard.type(
  "This is a live demo of the garden document editor. The assistant can read and edit this text through validated operations.",
  { delay: 45 },
);
await page.waitForTimeout(1500);

// Show a second line so the typing is clearly visible.
await page.keyboard.press("Enter");
await page.keyboard.type("Every change stays undoable and reviewable before it is applied.", {
  delay: 45,
});
await page.waitForTimeout(2000);

const video = page.video();
await page.close();
const recordedPath = await video.path();
await context.close();
await browser.close();

if (!recordedPath) {
  throw new Error("Playwright did not record a video.");
}

const finalPath = join(ARTIFACTS_DIR, "document-typing-demo.webm");
copyFileSync(recordedPath, finalPath);
console.log(`VIDEO_PATH=${finalPath}`);
