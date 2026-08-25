import { FileText } from "lucide-react";
import type { TextDoc } from "@/lib/docs/schema";
import { TextOpSchema, applyTextOps } from "@/lib/ops/text";
import { createTextDoc } from "@/lib/docs/factories";
import { docToMarkdown } from "@/lib/text/markdown";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { createTextAdapter } from "@/lib/text/writer-adapter";
import { registerSurface } from "./registry";

function serializeText(doc: TextDoc): string {
  const blocks = doc.body.content ?? [];
  if (blocks.length === 0) return "(empty document)";
  return blocks
    .map((block, i) => {
      const markdown = docToMarkdown({ type: "doc", content: [block] });
      return `[${i}] ${markdown || "(empty)"}`;
    })
    .join("\n\n");
}

function describeTextSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "text") return null;
  return selection.text
    ? `The user has selected block ${selection.blockIndex}${
        selection.blockCount > 1 ? `–${selection.blockIndex + selection.blockCount - 1}` : ""
      }: "${truncate(selection.text, 400)}"`
    : null;
}

function mockText(request: MockRequest): string {
  const doc = request.doc as TextDoc;
  const ask = request.request.toLowerCase();
  const blockCount = doc.body.content?.length ?? 0;
  const source = request.companions?.[0]?.doc;

  if (source) {
    return block(
      `Drafted a summary of "${source.title}" at the top of this document.`,
      [
        {
          op: "insertMarkdown",
          index: 0,
          markdown: [
            `## Summary of ${source.title}`,
            "",
            "- The source material sets out its central claim early and returns to it throughout.",
            "- Supporting evidence is strongest in the middle section.",
            "- Open questions are left for the closing remarks.",
          ].join("\n"),
        },
      ],
    );
  }

  if (/outline|summar|tl;?dr|abstract/.test(ask)) {
    return block("Added an outline above the existing content.", [
      {
        op: "insertMarkdown",
        index: 0,
        markdown: [
          "## Outline",
          "",
          "1. Context and motivation",
          "2. What changed",
          "3. What it means",
          "4. Next steps",
        ].join("\n"),
      },
    ]);
  }

  if (/rewrite|rephrase|tighten|edit|shorten|clarif/.test(ask)) {
    const index = request.selection?.kind === "text" ? request.selection.blockIndex : 0;
    const count =
      request.selection?.kind === "text"
        ? Math.max(1, request.selection.blockCount)
        : Math.min(1, blockCount);
    if (count === 0) {
      return block("There is nothing here to rewrite yet.", []);
    }
    return block(`Tightened ${count} block${count === 1 ? "" : "s"} starting at ${index}.`, [
      {
        op: "replaceMarkdown",
        index,
        count,
        markdown:
          "This passage has been tightened: the claim comes first, the supporting detail follows, and the hedging is gone.",
      },
    ]);
  }

  if (/heading|structure|section/.test(ask)) {
    return block("Added a section heading.", [
      {
        op: "insertMarkdown",
        index: blockCount,
        markdown: "## New section\n\nContent goes here.",
      },
    ]);
  }

  return block("Added a paragraph at the end of the document.", [
    {
      op: "insertMarkdown",
      index: blockCount,
      markdown:
        "A scripted paragraph, appended by the mock provider. Start a local model to get a real one.",
    },
  ]);
}

function describeTextOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "spliceBlocks":
      return (op.count as number) === 0
        ? `Insert ${(op.nodes as unknown[]).length} block${plural((op.nodes as unknown[]).length)} at position ${op.index}`
        : `Replace ${op.count} block${plural(op.count as number)} at position ${op.index}`;
    case "insertMarkdown":
      return `Insert ${preview(op.markdown as string)} at position ${op.index}`;
    case "replaceMarkdown":
      return `Rewrite ${op.count} block${plural(op.count as number)} from position ${op.index}`;
    case "deleteBlocks":
      return `Delete ${op.count} block${plural(op.count as number)} at position ${op.index}`;
    case "replaceDoc":
      return `Replace the whole document (${wordCount(op.markdown as string)} words)`;
    default:
      return undefined;
  }
}

registerSurface({
  kind: "text",
  label: "Document",
  icon: FileText,
  iconColor: "#0ea5e9",
  opSchema: TextOpSchema,
  applyOps: applyTextOps,
  createDoc: createTextDoc,
  ownsHistory: false,
  contextBudget: 12_000,
  promptNotes:
    "Blocks are addressed by the [n] index shown in the document. Indices refer to the " +
    "document as it is now — when you emit several operations, later ones apply to the " +
    "document as changed by earlier ones, so work from the bottom up when inserting in " +
    "multiple places. Content is written as markdown.",
  serializeDoc: serializeText,
  describeSelection: describeTextSelection,
  mockReply: mockText,
  describeOp: describeTextOp,
  referencedBlobIds: () => new Set(),
  remapBlobIds: (doc) => doc,
  adapter: {
    engine: "borrowed",
    status: "planned",
    userEdits: "textarea onChange commits coalesced replaceDoc ops",
    gardenUpdates: "doc.body sync with a lastPushed echo guard",
    selection: "block range + selected text, pushed to the workspace store",
    notes: "Stored body is ProseMirror JSON. WriterAdapter is the engine boundary; Garden owns undo.",
    relatedIssue: 33,
  },
  createAdapter: createTextAdapter,
  loadComponent: () => import("@/surfaces/text/text-surface"),
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

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
