import { z } from "zod";
import { type PmNode, PmNodeSchema } from "@/lib/docs/schema";
import { markdownToBlocks } from "@/lib/text/markdown";
import { OpError } from "./errors";

/**
 * Text operations, addressed by top-level block index.
 *
 * The markdown-flavoured ops (`insertMarkdown`, `replaceMarkdown`,
 * `replaceDoc`) are what the AI emits. They all compile down to `spliceBlocks`,
 * which is also the only op an inverse is ever expressed in — so undo restores
 * the exact ProseMirror nodes that were there, not a markdown round-trip of
 * them. That distinction matters: markdown is lossy for anything StarterKit can
 * represent but markdown cannot.
 */
export const TextOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("spliceBlocks"),
      index: z.number().int().min(0),
      count: z.number().int().min(0),
      nodes: z.array(PmNodeSchema),
    })
    .describe("Replace `count` blocks starting at `index` with explicit ProseMirror nodes"),
  z
    .object({
      op: z.literal("insertMarkdown"),
      index: z.number().int().min(0),
      markdown: z.string(),
    })
    .describe("Insert markdown as new blocks before the block at `index`"),
  z
    .object({
      op: z.literal("replaceMarkdown"),
      index: z.number().int().min(0),
      count: z.number().int().min(1),
      markdown: z.string(),
    })
    .describe("Replace `count` blocks starting at `index` with markdown"),
  z
    .object({
      op: z.literal("deleteBlocks"),
      index: z.number().int().min(0),
      count: z.number().int().min(1),
    })
    .describe("Delete `count` blocks starting at `index`"),
  z
    .object({ op: z.literal("replaceDoc"), markdown: z.string() })
    .describe("Replace the entire document body with markdown"),
]);

export type TextOp = z.infer<typeof TextOpSchema>;

interface Splice {
  index: number;
  count: number;
  nodes: PmNode[];
}

function toSplice(op: TextOp, blockCount: number): Splice {
  switch (op.op) {
    case "spliceBlocks":
      return { index: op.index, count: op.count, nodes: op.nodes };
    case "insertMarkdown":
      return { index: op.index, count: 0, nodes: markdownToBlocks(op.markdown) };
    case "replaceMarkdown":
      return { index: op.index, count: op.count, nodes: markdownToBlocks(op.markdown) };
    case "deleteBlocks":
      return { index: op.index, count: op.count, nodes: [] };
    case "replaceDoc":
      return { index: 0, count: blockCount, nodes: markdownToBlocks(op.markdown) };
  }
}

export function applyTextOps(body: PmNode, ops: TextOp[]): { body: PmNode; inverse: TextOp[] } {
  if (body.type !== "doc") throw new OpError("text body must be a ProseMirror doc node");

  let blocks = (body.content ?? []).slice();
  const inverse: TextOp[] = [];

  for (const op of ops) {
    const splice = toSplice(op, blocks.length);

    if (splice.index > blocks.length) {
      throw new OpError(
        `${op.op}: index ${splice.index} is past the end of the document (${blocks.length} blocks)`,
      );
    }
    if (splice.index + splice.count > blocks.length) {
      throw new OpError(
        `${op.op}: range ${splice.index}..${splice.index + splice.count} exceeds the document (${blocks.length} blocks)`,
      );
    }

    const removed = blocks.slice(splice.index, splice.index + splice.count);
    inverse.push({
      op: "spliceBlocks",
      index: splice.index,
      count: splice.nodes.length,
      nodes: removed,
    });

    blocks = [
      ...blocks.slice(0, splice.index),
      ...splice.nodes,
      ...blocks.slice(splice.index + splice.count),
    ];
  }

  // ProseMirror requires at least one block; an empty doc is an invalid doc.
  // The padding paragraph is real content as far as later ops are concerned, so
  // the most recent inverse entry has to widen by one to consume it — otherwise
  // undo would restore the original blocks *and* leave the padding behind.
  if (blocks.length === 0) {
    blocks = [{ type: "paragraph" }];
    const last = inverse[inverse.length - 1];
    if (last && last.op === "spliceBlocks") last.count += 1;
  }

  return { body: { ...body, content: blocks }, inverse: inverse.reverse() };
}
