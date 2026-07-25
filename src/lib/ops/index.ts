import { z } from "zod";
import type { Doc, DocKind, DocOf } from "@/lib/docs/schema";
import { applyCanvasOps, CanvasOpSchema, type CanvasOp } from "./canvas";
import { applyDeckOps, DeckOpSchema, type DeckOp } from "./deck";
import { applyPdfOps, PdfOpSchema, type PdfOp } from "./pdf";
import { applyTextOps, TextOpSchema, type TextOp } from "./text";
import { OpError } from "./errors";

export { OpError } from "./errors";
export { CanvasOpSchema, type CanvasOp } from "./canvas";
export { DeckOpSchema, type DeckOp } from "./deck";
export { PdfOpSchema, type PdfOp } from "./pdf";
export { TextOpSchema, type TextOp } from "./text";

/** Maps a document kind to its operation type. */
export interface OpMap {
  text: TextOp;
  canvas: CanvasOp;
  deck: DeckOp;
  pdf: PdfOp;
}
export type OpOf<K extends DocKind> = OpMap[K];
export type AnyOp = TextOp | CanvasOp | DeckOp | PdfOp;

export const OP_SCHEMAS: { [K in DocKind]: z.ZodType<OpMap[K]> } = {
  text: TextOpSchema,
  canvas: CanvasOpSchema,
  deck: DeckOpSchema,
  pdf: PdfOpSchema,
};

/**
 * Applies a batch of operations to a document.
 *
 * All-or-nothing: a batch that throws part-way leaves the input document
 * untouched, because every reducer builds a new body rather than mutating the
 * one it was given.
 *
 * The returned `inverse` reverses the whole batch when applied to the result —
 * this is what the undo stack stores. Callers must not reorder it.
 */
export function applyOps<K extends DocKind>(
  doc: DocOf<K>,
  ops: OpOf<K>[],
): { doc: DocOf<K>; inverse: OpOf<K>[] } {
  if (ops.length === 0) return { doc, inverse: [] };

  // TypeScript cannot narrow a generic `DocOf<K>` through a switch, so widen to
  // the concrete union first — the discriminant then narrows each branch's body.
  const target = doc as Doc;
  let result: { body: unknown; inverse: unknown[] };

  switch (target.kind) {
    case "text":
      result = applyTextOps(target.body, ops as TextOp[]);
      break;
    case "canvas":
      result = applyCanvasOps(target.body, ops as CanvasOp[]);
      break;
    case "deck":
      result = applyDeckOps(target.body, ops as DeckOp[]);
      break;
    case "pdf":
      result = applyPdfOps(target.body, ops as PdfOp[]);
      break;
    default: {
      const never: never = target;
      throw new OpError(`unknown document kind: ${JSON.stringify(never)}`);
    }
  }

  return {
    doc: { ...target, body: result.body, updatedAt: Date.now() } as DocOf<K>,
    inverse: result.inverse as OpOf<K>[],
  };
}

/**
 * Validates raw (typically model-authored) operations against the schema for a
 * document kind. Returns either every parsed op or every error — partial
 * batches are never applied, since half of a diagram is worse than none of it.
 */
export function parseOps<K extends DocKind>(
  kind: K,
  raw: unknown,
): { ok: true; ops: OpOf<K>[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: ["expected an array of operations"] };
  }

  const schema = OP_SCHEMAS[kind];
  const ops: OpOf<K>[] = [];
  const errors: string[] = [];

  raw.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      ops.push(parsed.data);
    } else {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      errors.push(`operation ${i} (${describeOp(item)}): ${detail}`);
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, ops };
}

function describeOp(item: unknown): string {
  if (item && typeof item === "object" && "op" in item) {
    return String((item as { op: unknown }).op);
  }
  return typeof item;
}

/**
 * A one-line, human-readable summary of an operation, shown on the AI review
 * card so a user can judge a suggestion without reading JSON.
 */
export function describeOperation(op: AnyOp): string {
  switch (op.op) {
    // text
    case "spliceBlocks":
      return op.count === 0
        ? `Insert ${op.nodes.length} block${plural(op.nodes.length)} at position ${op.index}`
        : `Replace ${op.count} block${plural(op.count)} at position ${op.index}`;
    case "insertMarkdown":
      return `Insert ${preview(op.markdown)} at position ${op.index}`;
    case "replaceMarkdown":
      return `Rewrite ${op.count} block${plural(op.count)} from position ${op.index}`;
    case "deleteBlocks":
      return `Delete ${op.count} block${plural(op.count)} at position ${op.index}`;
    case "replaceDoc":
      return `Replace the whole document (${wordCount(op.markdown)} words)`;

    // canvas
    case "addNode":
      return `Add ${op.node.kind}${nodeLabel(op.node)}`;
    case "updateNode":
      return `Update ${op.id} (${Object.keys(op.patch).join(", ")})`;
    case "deleteNode":
      return `Delete ${op.id}`;
    case "reorderNode":
      return `Move ${op.id} to position ${op.toIndex}`;
    case "setBackground":
      return `Set canvas background to ${op.background}`;

    // deck
    case "addSlide":
      return `Add ${op.layout} slide${op.title ? ` "${truncate(op.title, 40)}"` : ""}`;
    case "insertSlide":
      return `Insert slide ${op.slide.id}`;
    case "deleteSlide":
      return `Delete slide ${op.id}`;
    case "moveSlide":
      return `Move slide to position ${op.toIndex + 1}`;
    case "setSlide":
      return `Update slide (${Object.keys(op.patch).join(", ")})`;
    case "addElement":
      return `Add ${op.element.type} element to a slide`;
    case "updateElement":
      return `Update element (${Object.keys(op.patch).join(", ")})`;
    case "deleteElement":
      return `Delete an element`;
    case "reorderElement":
      return `Restack an element`;
    case "setTheme":
      return `Change deck theme (${Object.keys(op.patch).join(", ")})`;

    // pdf
    case "addAnnotation":
      return `${capitalise(op.type)} on page ${op.page}${op.quote ? `: ${preview(op.quote)}` : ""}`;
    case "updateAnnotation":
      return `Update annotation (${Object.keys(op.patch).join(", ")})`;
    case "deleteAnnotation":
      return `Delete annotation`;
    case "setPageText":
      return `Record extracted text for page ${op.page}`;
    case "setSource":
      return `Attach ${op.fileName || "PDF"} (${op.pageCount} pages)`;
  }
}

function nodeLabel(node: Record<string, unknown>): string {
  const text = node.text ?? node.name ?? node.label;
  return typeof text === "string" && text.trim() ? ` "${truncate(text, 40)}"` : "";
}

function preview(md: string): string {
  const flat = md.replace(/\s+/g, " ").trim();
  return `"${truncate(flat, 60)}"`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
