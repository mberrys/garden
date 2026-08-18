import type { EditorAdapter } from "./contract";

/**
 * Headless Garden session for adapter tests.
 *
 * Mirrors the workspace invariants without Zustand: user edits apply immediately
 * through `applyOps`, AI batches sit behind a review gate, and undo/redo use
 * stored inverses. `adapter.update` runs under a syncing flag so a feedback
 * loop (ops emitted from `update`) fails closed instead of recursing.
 */

export class FeedbackLoopError extends Error {
  constructor(message = "adapter emitted ops from update (feedback loop)") {
    super(message);
    this.name = "FeedbackLoopError";
  }
}

export interface HistoryEntry<Op> {
  forward: Op[];
  inverse: Op[];
}

export interface AdapterHostOptions<Doc, Op> {
  initialDoc: Doc;
  applyOps: (doc: Doc, ops: Op[]) => { doc: Doc; inverse: Op[] };
}

export interface AdapterHost<Doc, Op> {
  getDoc(): Doc;
  historyLength(): number;
  pendingAi(): Op[] | null;
  applyExternal(ops: Op[]): void;
  undo(): void;
  redo(): void;
  proposeAi(ops: Op[]): void;
  accept(): void;
  reject(): void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createAdapterHost<Doc, Op, Selection>(
  adapter: EditorAdapter<Doc, Op, Selection>,
  options: AdapterHostOptions<Doc, Op>,
): AdapterHost<Doc, Op> {
  let doc = clone(options.initialDoc);
  const undoStack: HistoryEntry<Op>[] = [];
  const redoStack: HistoryEntry<Op>[] = [];
  let pending: Op[] | null = null;
  let syncing = false;

  function apply(ops: Op[]): void {
    if (ops.length === 0) return;
    const result = options.applyOps(doc, ops);
    undoStack.push({ forward: ops, inverse: result.inverse });
    redoStack.length = 0;
    doc = result.doc;
    pushToEngine();
  }

  function pushToEngine(): void {
    syncing = true;
    try {
      adapter.update(clone(doc));
    } finally {
      syncing = false;
    }
  }

  adapter.mount(clone(doc));
  adapter.onUserEdit((ops) => {
    if (syncing) throw new FeedbackLoopError();
    apply(ops);
  });

  return {
    getDoc: () => doc,
    historyLength: () => undoStack.length,
    pendingAi: () => pending,
    applyExternal: (ops) => apply(ops),
    undo: () => {
      const entry = undoStack.pop();
      if (!entry) return;
      const result = options.applyOps(doc, entry.inverse);
      doc = result.doc;
      redoStack.push(entry);
      pushToEngine();
    },
    redo: () => {
      const entry = redoStack.pop();
      if (!entry) return;
      const result = options.applyOps(doc, entry.forward);
      doc = result.doc;
      undoStack.push({ forward: entry.forward, inverse: result.inverse });
      pushToEngine();
    },
    proposeAi: (ops) => {
      pending = clone(ops);
    },
    accept: () => {
      if (!pending) return;
      const ops = pending;
      pending = null;
      apply(ops);
    },
    reject: () => {
      pending = null;
    },
  };
}
