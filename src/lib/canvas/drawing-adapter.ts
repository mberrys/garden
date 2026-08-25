import { applyOps, type CanvasOp } from "@/lib/ops";
import type { CanvasDoc } from "@/lib/docs/schema";
import { createCanvasDoc } from "@/lib/docs/factories";
import type { EditorAdapter } from "@/lib/surfaces/adapter";
import type { AdapterDriver, TestAdapter } from "@/lib/surfaces/conformance";
import type { SurfaceSelection } from "@/lib/store/workspace";

export type CanvasIntent = { type: "addRect"; x: number; y: number };

/**
 * Drawing adapter: Garden canvas JSON in, canvas ops out. History stays on
 * Garden's stack — this adapter never owns undo.
 */
export function createCanvasAdapter(): TestAdapter<
  CanvasDoc,
  CanvasOp,
  SurfaceSelection,
  CanvasIntent
> {
  let doc = createCanvasDoc();
  let selection: SurfaceSelection | null = null;
  let onEdit: ((ops: CanvasOp[]) => void) | null = null;
  let applying = false;
  const ephemeral = { panPx: 0 };

  const adapter: EditorAdapter<CanvasDoc, CanvasOp, SurfaceSelection> &
    AdapterDriver<CanvasDoc, CanvasIntent> = {
    mount(next) {
      doc = structuredClone(next);
    },
    update(next) {
      if (applying) return;
      applying = true;
      doc = structuredClone(next);
      applying = false;
    },
    onUserEdit(callback) {
      onEdit = callback;
    },
    readSelection() {
      return selection;
    },
    focusSelection(next) {
      selection = next;
    },
    dispose() {
      onEdit = null;
      selection = null;
      ephemeral.panPx = 0;
    },
    simulateUserEdit(intent) {
      if (applying) return;
      ephemeral.panPx += 8;
      const ops: CanvasOp[] = [
        {
          op: "addNode",
          node: { kind: "rect", id: "nd_intent", x: intent.x, y: intent.y, w: 80, h: 48 },
        },
      ];
      onEdit?.(ops);
    },
    readEngineDoc() {
      return structuredClone(doc);
    },
    engineOwnsHistory() {
      return false;
    },
    readEngineEphemeral() {
      return { panPx: ephemeral.panPx };
    },
  };

  return adapter;
}

export function applyCanvasAdapterOps(
  doc: CanvasDoc,
  ops: CanvasOp[],
): { doc: CanvasDoc; inverse: CanvasOp[] } {
  return applyOps(doc, ops);
}

export function serializeCanvasAdapterDoc(doc: CanvasDoc): unknown {
  return { id: doc.id, kind: doc.kind, body: doc.body };
}

export function serializeCanvasSelection(selection: SurfaceSelection): unknown {
  return JSON.parse(JSON.stringify(selection)) as unknown;
}
