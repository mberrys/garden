"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * pdf.js loading.
 *
 * Kept apart from the surface component for two reasons: the worker has to be
 * configured exactly once per page load, and the import must stay dynamic so
 * the (very large) library never lands in the initial bundle or gets evaluated
 * during server rendering.
 *
 * The `legacy` build is deliberate. Modern pdf.js calls
 * `Map.prototype.getOrInsertComputed`, a very recent proposal that throws
 * "getOrInsertComputed is not a function" on any browser more than a few months
 * old — every page render fails. The legacy bundle ships the core-js polyfills
 * for it, at the cost of a slightly larger download.
 */

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let modulePromise: Promise<PdfJs> | null = null;

async function getPdfJs(): Promise<PdfJs> {
  if (!modulePromise) {
    modulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return modulePromise;
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  // pdf.js takes ownership of the buffer it is given and detaches it, so hand
  // it a copy — the caller's blob may be read again for export.
  const task = pdfjs.getDocument({ data: data.slice(0) });
  return task.promise;
}

/**
 * Tears a document down, freeing its worker-side resources.
 *
 * `destroy` lives on the loading task rather than the document proxy; calling
 * only `cleanup()` leaves the worker holding the whole file, which matters when
 * a user opens several large PDFs in a session.
 */
export async function destroyPdfDocument(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // Already torn down, or the worker went away first — nothing to recover.
  }
}

/** Plain text of a page, with pdf.js's text items joined into readable lines. */
export async function extractPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();

  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;

  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5] as number;
    // A vertical jump of more than a couple of points means a new line; pdf.js
    // emits items in reading order but without line structure.
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (current.trim()) lines.push(current.trim());
      current = "";
    }
    current += item.str;
    if (item.hasEOL) {
      if (current.trim()) lines.push(current.trim());
      current = "";
    }
    lastY = y;
  }
  if (current.trim()) lines.push(current.trim());

  return lines.join("\n");
}
