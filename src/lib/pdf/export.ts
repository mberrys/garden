"use client";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Annotation } from "@/lib/docs/schema";

/**
 * Flattens annotations into a copy of the original PDF.
 *
 * Annotations are drawn as page content rather than as PDF annotation objects,
 * so they survive in every viewer — including ones that ignore annotation
 * layers, and printing. The original bytes are never modified.
 */
export async function exportAnnotatedPdf(
  source: ArrayBuffer,
  annotations: Annotation[],
): Promise<Blob> {
  const pdf = await PDFDocument.load(source);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const byPage = new Map<number, Annotation[]>();
  for (const annotation of annotations) {
    const list = byPage.get(annotation.page);
    if (list) list.push(annotation);
    else byPage.set(annotation.page, [annotation]);
  }

  for (const [pageNumber, pageAnnotations] of byPage) {
    const page = pages[pageNumber - 1];
    if (!page) continue;

    const { width, height } = page.getSize();

    for (const annotation of pageAnnotations) {
      const color = hexToRgb(annotation.color);
      const x = annotation.rect.x * width;
      const w = annotation.rect.w * width;
      const h = annotation.rect.h * height;
      // Our rects have a top-left origin; PDF user space has a bottom-left one.
      const y = height - (annotation.rect.y * height) - h;

      switch (annotation.type) {
        case "highlight":
          page.drawRectangle({ x, y, width: w, height: h, color, opacity: 0.35 });
          break;
        case "underline":
          page.drawRectangle({ x, y, width: w, height: 1.5, color });
          break;
        case "strikeout":
          page.drawRectangle({ x, y: y + h / 2, width: w, height: 1.5, color });
          break;
        case "box":
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: color,
            borderWidth: 1.5,
            opacity: 0,
          });
          break;
        case "note":
          page.drawRectangle({ x, y, width: 3, height: h, color });
          page.drawRectangle({ x, y, width: w, height: h, color, opacity: 0.12 });
          break;
      }

      if (annotation.note) {
        const size = 8;
        page.drawText(truncate(annotation.note, 120), {
          x,
          y: Math.max(4, y - size - 2),
          size,
          font,
          color,
          maxWidth: Math.max(60, w),
          lineHeight: size * 1.2,
        });
      }
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(value)) return rgb(0.98, 0.75, 0.14);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
