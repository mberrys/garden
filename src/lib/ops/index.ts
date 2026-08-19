import { z } from "zod";
import type { Doc, DocKind, DocOf } from "@/lib/docs/schema";
import { CanvasOpSchema, type CanvasOp } from "./canvas";
import { DeckOpSchema, type DeckOp } from "./deck";
import { PdfOpSchema, type PdfOp } from "./pdf";
import { SheetOpSchema, type SheetOp } from "./sheet";
import { TextOpSchema, type TextOp } from "./text";
import "@/lib/surfaces";
import { getSurface, allSurfaces } from "@/lib/surfaces/registry";

export { OpError } from "./errors";
export { CanvasOpSchema, type CanvasOp } from "./canvas";
export { DeckOpSchema, type DeckOp } from "./deck";
export { PdfOpSchema, type PdfOp } from "./pdf";
export { SheetOpSchema, type SheetOp } from "./sheet";
export { TextOpSchema, type TextOp } from "./text";

/** Maps a document kind to its operation type. */
export interface OpMap {
  text: TextOp;
  canvas: CanvasOp;
  deck: DeckOp;
  pdf: PdfOp;
  sheet: SheetOp;
}
export type OpOf<K extends DocKind> = OpMap[K];
export type AnyOp = TextOp | CanvasOp | DeckOp | PdfOp | SheetOp;

export const OP_SCHEMAS: { [K in DocKind]: z.ZodType<OpMap[K]> } = {
  text: TextOpSchema,
  canvas: CanvasOpSchema,
  deck: DeckOpSchema,
  pdf: PdfOpSchema,
  sheet: SheetOpSchema,
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

  const target = doc as Doc;
  const surface = getSurface(target.kind);
  const result = surface.applyOps(target.body, ops);

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
  for (const surface of allSurfaces()) {
    const desc = surface.describeOp(op);
    if (desc !== undefined) return desc;
  }
  return `Unknown operation: ${(op as { op: string }).op}`;
}
