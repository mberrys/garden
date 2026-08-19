import { DOC_KIND_LABELS, type DocKind } from "@/lib/docs/schema";

/**
 * How a built-in surface sits against {@link EditorAdapter} today — without
 * wrapping the React hosts in a real adapter. Status is `planned` when a later
 * suite issue will put a borrowed engine behind the contract.
 */
export type AdapterStatus = "not-required" | "planned";

export type EngineOwnership = "garden" | "borrowed";

export interface BuiltinSurfaceDescription {
  kind: DocKind;
  label: string;
  engine: EngineOwnership;
  adapterStatus: AdapterStatus;
  /** `EditorAdapter.onUserEdit` — how gestures become ops today. */
  userEdits: string;
  /** `EditorAdapter.update` — how Garden state reaches the UI. */
  gardenUpdates: string;
  /** Undo must stay on Garden's workspace stack, never the engine. */
  undo: "garden";
  /** `readSelection` / `focusSelection` — what the surface publishes today. */
  selection: string;
  notes: string;
  relatedIssue?: number;
}

export const BUILTIN_SURFACES = {
  text: {
    kind: "text",
    label: DOC_KIND_LABELS.text,
    engine: "garden",
    adapterStatus: "planned",
    userEdits: "textarea onChange commits coalesced replaceDoc ops",
    gardenUpdates: "doc.body sync with a lastPushed echo guard",
    undo: "garden",
    selection: "block range + selected text, pushed to the workspace store",
    notes: "Stored body is ProseMirror JSON; the textarea is not the source of truth. Writer (#33) will put ProseMirror behind EditorAdapter.",
    relatedIssue: 33,
  },
  canvas: {
    kind: "canvas",
    label: DOC_KIND_LABELS.canvas,
    engine: "garden",
    adapterStatus: "not-required",
    userEdits: "gestures preview locally, then commit on release",
    gardenUpdates: "React host re-renders from CanvasDoc.body",
    undo: "garden",
    selection: "node id list, pushed to the workspace store",
    notes: "Garden-owned scene graph. Optional Konva later (#41) must mount as an adapter, not as the document model.",
    relatedIssue: 41,
  },
  deck: {
    kind: "deck",
    label: DOC_KIND_LABELS.deck,
    engine: "garden",
    adapterStatus: "not-required",
    userEdits: "stage gestures call commit with deck ops",
    gardenUpdates: "React host re-renders from DeckDoc.body",
    undo: "garden",
    selection: "active slide + element ids, pushed to the workspace store",
    notes: "Garden-owned slide stage. Slides suite (#38) keeps this model; export is separate.",
    relatedIssue: 38,
  },
  pdf: {
    kind: "pdf",
    label: DOC_KIND_LABELS.pdf,
    engine: "borrowed",
    adapterStatus: "planned",
    userEdits: "annotation gestures commit pdf ops; extracted text uses skipHistory",
    gardenUpdates: "pdf.js renders bytes; annotation overlay reads PdfDoc.body",
    undo: "garden",
    selection: "page + quote + annotation id, pushed to the workspace store",
    notes: "pdf.js is a renderer. Annotations, undo, and .gardenspace must stay Garden-owned (#40).",
    relatedIssue: 40,
  },
} as const satisfies Record<DocKind, BuiltinSurfaceDescription>;

export type BuiltinKind = keyof typeof BUILTIN_SURFACES;
