import type { EditorAdapter } from "./adapter";
import type { GardenDocEnvelope, AdapterSurfaceDefinition } from "./definition";

interface HistoryEntry<Op> {
  inverse: Op[];
  forward: Op[];
}

export interface AdapterSession<
  Kind extends string,
  Body,
  Op,
  Selection,
  Doc extends GardenDocEnvelope<Kind, Body> = GardenDocEnvelope<Kind, Body>,
> {
  getDoc(): Doc;
  getAdapter(): EditorAdapter<Body, Op, Selection>;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  proposeAi(ops: Op[]): void;
  acceptAi(): boolean;
  rejectAi(): void;
  hasPendingAi(): boolean;
  serialize(): Doc;
  remount(): void;
  dispose(): void;
}

/**
 * Pure adapter host used by the conformance harness (and, later, product
 * surfaces). Wires echo-guarded `update`, workspace-style undo, and the AI
 * review gate without Zustand or Dexie.
 */
export function createAdapterSession<
  Kind extends string,
  Body,
  Op,
  Selection,
  Doc extends GardenDocEnvelope<Kind, Body>,
>(
  definition: AdapterSurfaceDefinition<Body, Op, Selection, Kind>,
  initialDoc: Doc,
): AdapterSession<Kind, Body, Op, Selection, Doc> {
  let doc = initialDoc;
  let adapter = definition.createAdapter();
  let updating = false;
  let pendingAi: Op[] | null = null;
  const undoStack: HistoryEntry<Op>[] = [];
  const redoStack: HistoryEntry<Op>[] = [];

  const emitUserEdit = (ops: Op[]) => {
    if (updating || ops.length === 0) return;

    for (const op of ops) {
      const parsed = definition.opSchema.safeParse(op);
      if (!parsed.success) return;
    }

    const { body, inverse } = definition.apply(doc.body, ops);
    doc = { ...doc, body, updatedAt: Date.now() };
    undoStack.push({ inverse, forward: ops });
    redoStack.length = 0;

    updating = true;
    adapter.update(doc.body);
    updating = false;
  };

  const mountAdapter = (target: Doc) => {
    adapter.dispose();
    adapter = definition.createAdapter();
    adapter.onUserEdit(emitUserEdit);
    adapter.mount(target.body);
  };

  mountAdapter(doc);

  return {
    getDoc: () => doc,
    getAdapter: () => adapter,

    undo() {
      const entry = undoStack.pop();
      if (!entry) return false;
      const { body } = definition.apply(doc.body, entry.inverse);
      doc = { ...doc, body, updatedAt: Date.now() };
      redoStack.push(entry);
      updating = true;
      adapter.update(doc.body);
      updating = false;
      return true;
    },

    redo() {
      const entry = redoStack.pop();
      if (!entry) return false;
      const { body } = definition.apply(doc.body, entry.forward);
      doc = { ...doc, body, updatedAt: Date.now() };
      undoStack.push(entry);
      updating = true;
      adapter.update(doc.body);
      updating = false;
      return true;
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,

    proposeAi(ops: Op[]) {
      pendingAi = ops;
    },

    acceptAi() {
      if (!pendingAi || pendingAi.length === 0) return false;
      const ops = pendingAi;
      pendingAi = null;
      emitUserEdit(ops);
      return true;
    },

    rejectAi() {
      pendingAi = null;
    },

    hasPendingAi: () => pendingAi !== null && pendingAi.length > 0,

    serialize: () => structuredClone(doc),

    remount() {
      const snapshot = structuredClone(doc);
      mountAdapter(snapshot);
    },

    dispose() {
      adapter.dispose();
      pendingAi = null;
    },
  };
}
