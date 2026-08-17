import { FileType2 } from "lucide-react";
import type { PdfDoc } from "@/lib/docs/schema";
import { PdfOpSchema, applyPdfOps } from "@/lib/ops/pdf";
import { createPdfDoc } from "@/lib/docs/factories";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializePdf(doc: PdfDoc, selection?: SurfaceSelection): string {
  const { pageCount, fileName, annotations, pageText } = doc.body;
  const header = `PDF "${fileName || doc.title}", ${pageCount} page(s).`;

  const extracted = Object.entries(pageText)
    .map(([page, text]) => ({ page: Number(page), text }))
    .filter((p) => p.text.trim())
    .sort((a, b) => a.page - b.page);

  const parts = [header];

  if (annotations.length) {
    parts.push(
      `\nAnnotations:\n${annotations
        .map(
          (a) =>
            `  ${a.id} ${a.type} p${a.page}${a.quote ? ` on "${truncate(a.quote, 120)}"` : ""}${a.note ? ` — note: ${a.note}` : ""}`,
        )
        .join("\n")}`,
    );
  }

  if (extracted.length === 0) {
    parts.push("\nNo text extracted yet — scroll through the pages to extract them.");
    return parts.join("\n");
  }

  const focus = selection?.kind === "pdf" ? selection.page : extracted[0].page;
  const ordered = [...extracted].sort(
    (a, b) => Math.abs(a.page - focus) - Math.abs(b.page - focus),
  );

  parts.push("\nPage text:");
  for (const page of ordered) {
    parts.push(`\n--- page ${page.page} ---\n${page.text.trim()}`);
  }

  return parts.join("\n");
}

function describePdfSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "pdf") return null;
  return selection.text
    ? `The user has selected text on page ${selection.page}: "${truncate(selection.text, 400)}"`
    : `The user is looking at page ${selection.page}`;
}

function mockPdf(request: MockRequest): string {
  const doc = request.doc as PdfDoc;
  const ask = request.request.toLowerCase();
  const { pageCount, pageText, annotations } = doc.body;

  if (pageCount === 0) {
    return block("There is no PDF attached to this document yet.", []);
  }

  if (/summar|what.*say|about/.test(ask) && !/highlight|mark|annotate/.test(ask)) {
    const extracted = Object.values(pageText).filter(Boolean).length;
    return block(
      extracted > 0
        ? `This is a ${pageCount}-page document; ${extracted} page${extracted === 1 ? " has" : "s have"} been read so far. ` +
            `It carries ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}. ` +
            `A real local model would summarise the contents here.`
        : `This is a ${pageCount}-page document, but no pages have been read yet — scroll through it and ask again.`,
      [],
    );
  }

  const pages = Object.keys(pageText)
    .map(Number)
    .filter((page) => pageText[String(page)]?.trim())
    .sort((a, b) => a - b)
    .slice(0, 3);

  if (pages.length === 0) {
    return block(
      "No page text has been extracted yet — scroll through the pages and ask again.",
      [],
    );
  }

  return block(
    `Marked a passage on ${pages.length} page${pages.length === 1 ? "" : "s"}.`,
    pages.map((page, i) => ({
      op: "addAnnotation",
      page,
      type: i === 0 ? "highlight" : "box",
      rect: { x: 0.1, y: 0.18 + i * 0.12, w: 0.78, h: 0.05 },
      quote: truncate((pageText[String(page)] ?? "").replace(/\s+/g, " ").trim(), 120),
      note: i === 0 ? "Scripted highlight from the mock provider." : "",
    })),
  );
}

function describePdfOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "addAnnotation":
      return `${capitalise(String(op.type))} on page ${op.page}${op.quote ? `: ${preview(String(op.quote))}` : ""}`;
    case "updateAnnotation":
      return `Update annotation (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    case "deleteAnnotation":
      return `Delete annotation`;
    case "setPageText":
      return `Record extracted text for page ${op.page}`;
    case "setSource":
      return `Attach ${op.fileName || "PDF"} (${op.pageCount} pages)`;
    default:
      return undefined;
  }
}

function pdfReferencedBlobIds(doc: PdfDoc): Set<string> {
  const ids = new Set<string>();
  if (doc.body.blobId) ids.add(doc.body.blobId);
  return ids;
}

function pdfRemapBlobIds(doc: PdfDoc, map: Map<string, string>): PdfDoc {
  if (doc.body.blobId && map.has(doc.body.blobId)) {
    return { ...doc, body: { ...doc.body, blobId: map.get(doc.body.blobId)! } };
  }
  return doc;
}

registerSurface({
  kind: "pdf",
  label: "PDF",
  icon: FileType2,
  iconColor: "#ef4444",
  opSchema: PdfOpSchema,
  applyOps: applyPdfOps,
  createDoc: createPdfDoc,
  ownsHistory: false,
  contextBudget: 14_000,
  promptNotes:
    "The PDF's pages cannot be edited — you work by adding annotations over them. " +
    "Annotation rects are normalised to the page: x/y/w/h are fractions between 0 and 1 " +
    "with the origin at the top-left of the page.",
  serializeDoc: serializePdf,
  describeSelection: describePdfSelection,
  mockReply: mockPdf,
  describeOp: describePdfOp,
  referencedBlobIds: pdfReferencedBlobIds,
  remapBlobIds: pdfRemapBlobIds,
  loadComponent: () => import("@/surfaces/pdf/pdf-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}

function preview(md: string): string {
  const flat = md.replace(/\s+/g, " ").trim();
  return `"${truncate(flat, 60)}"`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
