import type { DocKind } from "@/lib/docs/schema";

/**
 * Contract notes for each built-in surface against the adapter era.
 *
 * No built-in implements `EditorAdapter` yet — this map exists so a new
 * `DocKind` fails typecheck until it is described here.
 */
export interface SurfaceContractNote {
  engine: string;
  hasAdapter: boolean;
  ownsHistory: false;
  selectionShape: string;
  /** AI edits flow through thread suggestions, never the engine undo stack. */
  aiPath: string;
}

export const BUILTIN_SURFACE_CONTRACTS = {
  text: {
    engine: "markdown textarea (future: ProseMirror)",
    hasAdapter: false,
    ownsHistory: false,
    selectionShape: "{ blockIndex, blockCount, text }",
    aiPath: "lib/ai/thread.ts suggestions → workspace.commit",
  },
  canvas: {
    engine: "custom canvas engine (not Konva)",
    hasAdapter: false,
    ownsHistory: false,
    selectionShape: "{ nodeIds: string[] }",
    aiPath: "lib/ai/thread.ts suggestions → workspace.commit",
  },
  deck: {
    engine: "custom slide stage (not embedded office runtime)",
    hasAdapter: false,
    ownsHistory: false,
    selectionShape: "{ slideId, elementIds }",
    aiPath: "lib/ai/thread.ts suggestions → workspace.commit",
  },
  pdf: {
    engine: "pdf.js viewer + annotation overlay",
    hasAdapter: false,
    ownsHistory: false,
    selectionShape: "{ page, text, annotationId }",
    aiPath: "lib/ai/thread.ts suggestions → workspace.commit",
  },
} satisfies Record<DocKind, SurfaceContractNote>;
