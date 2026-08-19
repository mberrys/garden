import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Page } from "@playwright/test";

export const FIXTURE_DIR = join(process.cwd(), "test-results", "fixtures");

/**
 * Builds the sample PDF the suite reads and annotates. Generated rather than
 * committed so the repository carries no binary fixture, and so the text is
 * known exactly — assertions can look for specific sentences.
 */
export async function samplePdfPath(): Promise<string> {
  const path = join(FIXTURE_DIR, "review.pdf");
  if (existsSync(path)) return path;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages: [string, ...string[]][] = [
    [
      "Quarterly Platform Review",
      "The migration completed three weeks ahead of schedule.",
      "Latency at the 99th percentile fell from 840ms to 210ms.",
      "Two incidents were traced to the old connection pool.",
    ],
    [
      "Costs and Capacity",
      "Compute spend fell 34% year on year.",
      "Storage grew 12% but sits inside the committed tier.",
      "Headroom is sufficient through the next two quarters.",
    ],
    [
      "Open Questions",
      "The rollback path has never been exercised under load.",
      "Ownership of the ingest pipeline is still unassigned.",
      "No timeline is agreed for deprecating the legacy API.",
    ],
  ];

  for (const [title, ...lines] of pages) {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, { x: 60, y: 760, size: 22, font: bold, color: rgb(0.1, 0.1, 0.15) });
    lines.forEach((line, i) =>
      page.drawText(line, { x: 60, y: 700 - i * 30, size: 12, font, color: rgb(0.2, 0.2, 0.25) }),
    );
  }

  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(path, await pdf.save());
  return path;
}

/**
 * Opens the app with an empty workspace — the seed documents are helpful for a
 * person and noise for a test.
 */
export async function openEmptyWorkspace(page: Page): Promise<void> {
  // Suppressing the seed is a flag the store reads at init; writing the
  // "seeded" marker into IndexedDB directly would mean recreating Dexie's
  // schema by hand, and getting it slightly wrong stops the app booting.
  await page.addInitScript(() => {
    window.__GARDEN_NO_SEED__ = true;
  });

  await page.goto("/");
  await page.waitForSelector('button[aria-label="New document"]', { timeout: 30_000 });
}

/** Opens the app and plants the welcome packet. */
export async function openSeededWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector('button[aria-label="New document"]', { timeout: 30_000 });
  await page.getByRole("button", { name: "Plant Welcome" }).click();
  await page.locator(".garden-markdown").waitFor({ timeout: 30_000 });
}

export async function newDocument(
  page: Page,
  kind: "Document" | "Canvas" | "Deck" | "PDF" | "Sheet" | "Database",
) {
  await page.click('button[aria-label="New document"]');
  await page.click(`[role="menuitem"]:has-text("${kind}")`);
}
