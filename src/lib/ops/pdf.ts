import { z } from "zod";
import { type PdfBody, AnnotationSchema, AnnotationTypeSchema, RectSchema } from "@/lib/docs/schema";
import { newAnnotationId } from "@/lib/docs/ids";
import { OpError } from "./errors";

/**
 * PDF operations.
 *
 * The PDF bytes themselves are immutable — everything editable about a PDF in
 * this app is an annotation layered over it, which is why there is no "edit
 * page" op. Export flattens annotations into a copy of the original file.
 *
 * `setPageText` is document state rather than a cache because it is what the AI
 * reads; it is extracted once per page as the page first renders.
 */
export const PdfOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("addAnnotation"),
      page: z.number().int().min(1),
      type: AnnotationTypeSchema,
      /** Normalised 0..1 page coordinates, origin top-left. */
      rect: RectSchema,
      color: z.string().optional(),
      quote: z.string().optional(),
      note: z.string().optional(),
      id: z.string().optional(),
      /** Only supplied when restoring a deleted annotation, so undo is exact. */
      createdAt: z.number().optional(),
    })
    .describe("Add a highlight, underline, strikeout, box or sticky note to a page"),
  z
    .object({
      op: z.literal("updateAnnotation"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Change an annotation's colour, note text or geometry"),
  z
    .object({ op: z.literal("deleteAnnotation"), id: z.string() })
    .describe("Remove an annotation"),
  z
    .object({
      op: z.literal("setPageText"),
      page: z.number().int().min(1),
      text: z.string(),
    })
    .describe("Record the extracted plain text of a page"),
  z
    .object({
      op: z.literal("setSource"),
      blobId: z.string().nullable(),
      fileName: z.string(),
      pageCount: z.number().int().min(0),
    })
    .describe("Attach PDF bytes to this document"),
]);

export type PdfOp = z.infer<typeof PdfOpSchema>;

export function applyPdfOps(body: PdfBody, ops: PdfOp[]): { body: PdfBody; inverse: PdfOp[] } {
  let annotations = body.annotations.slice();
  let pageText = body.pageText;
  let blobId = body.blobId;
  let fileName = body.fileName;
  let pageCount = body.pageCount;
  const inverse: PdfOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "addAnnotation": {
        const parsed = AnnotationSchema.safeParse({
          id: op.id ?? newAnnotationId(),
          page: op.page,
          type: op.type,
          rect: op.rect,
          color: op.color ?? defaultColor(op.type),
          quote: op.quote ?? "",
          note: op.note ?? "",
          createdAt: op.createdAt ?? Date.now(),
        });
        if (!parsed.success) {
          throw new OpError(`addAnnotation: ${formatIssues(parsed.error)}`);
        }
        if (annotations.some((a) => a.id === parsed.data.id)) {
          throw new OpError(`addAnnotation: annotation "${parsed.data.id}" already exists`);
        }
        annotations.push(parsed.data);
        inverse.push({ op: "deleteAnnotation", id: parsed.data.id });
        break;
      }

      case "updateAnnotation": {
        const i = annotations.findIndex((a) => a.id === op.id);
        if (i === -1) throw new OpError(`updateAnnotation: no annotation "${op.id}"`);
        const before = annotations[i];
        const parsed = AnnotationSchema.safeParse({ ...before, ...op.patch, id: before.id });
        if (!parsed.success) {
          throw new OpError(`updateAnnotation "${op.id}": ${formatIssues(parsed.error)}`);
        }
        const priorValues: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          priorValues[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateAnnotation", id: op.id, patch: priorValues });
        annotations = annotations.slice();
        annotations[i] = parsed.data;
        break;
      }

      case "deleteAnnotation": {
        const i = annotations.findIndex((a) => a.id === op.id);
        if (i === -1) throw new OpError(`deleteAnnotation: no annotation "${op.id}"`);
        const [removed] = annotations.splice(i, 1);
        inverse.push({
          op: "addAnnotation",
          id: removed.id,
          page: removed.page,
          type: removed.type,
          rect: removed.rect,
          color: removed.color,
          quote: removed.quote,
          note: removed.note,
          createdAt: removed.createdAt,
        });
        break;
      }

      case "setPageText": {
        const key = String(op.page);
        const before = pageText[key];
        // Extraction is idempotent; re-recording identical text is a no-op and
        // must not push an undo entry (pages re-render constantly on scroll).
        if (before === op.text) break;
        inverse.push({ op: "setPageText", page: op.page, text: before ?? "" });
        pageText = { ...pageText, [key]: op.text };
        break;
      }

      case "setSource": {
        inverse.push({ op: "setSource", blobId, fileName, pageCount });
        blobId = op.blobId;
        fileName = op.fileName;
        pageCount = op.pageCount;
        break;
      }
    }
  }

  return {
    body: { blobId, fileName, pageCount, annotations, pageText },
    inverse: inverse.reverse(),
  };
}

export function defaultColor(type: z.infer<typeof AnnotationTypeSchema>): string {
  switch (type) {
    case "highlight":
      return "#fbbf24";
    case "underline":
      return "#0ea5e9";
    case "strikeout":
      return "#ef4444";
    case "box":
      return "#8b5cf6";
    case "note":
      return "#10b981";
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ");
}
