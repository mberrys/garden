"use client";

import { create } from "zustand";
import type { CanvasBody, Doc, DocKind, DocOf } from "@/lib/docs/schema";
import { createDoc } from "@/lib/docs/factories";
import { applyOps, describeOperation, type AnyOp, type OpOf } from "@/lib/ops";
import { OpError } from "@/lib/ops/errors";
import { newBlobId, nid } from "@/lib/docs/ids";
import * as store from "./db";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface Pane {
  docIds: string[];
  activeDocId: string | null;
}

export type PaneIndex = 0 | 1;

export type SurfaceSelection =
  | { kind: "text"; blockIndex: number; blockCount: number; text: string }
  | { kind: "canvas"; nodeIds: string[] }
  | { kind: "deck"; slideId: string | null; elementIds: string[] }
  | { kind: "pdf"; page: number; text: string; annotationId: string | null };

interface HistoryEntry {
  inverse: AnyOp[];
  forward: AnyOp[];
  label: string;
  coalesceKey?: string;
  at: number;
}

export interface Toast {
  id: string;
  tone: "info" | "success" | "error";
  message: string;
}

export interface CommitOptions {
  /** Shown in the undo tooltip; derived from the ops when omitted. */
  label?: string;
  /**
   * Consecutive commits sharing a key within `COALESCE_MS` collapse into one
   * undo step. Dragging a shape emits an op per pointermove — without this,
   * ctrl+Z would rewind one mouse-frame at a time.
   */
  coalesceKey?: string;
  /** Skip the undo stack entirely (extraction, view state, editor-owned undo). */
  skipHistory?: boolean;
}

export interface CommitResult {
  ok: boolean;
  error?: string;
}

const COALESCE_MS = 900;
const HISTORY_LIMIT = 200;
const SAVE_DEBOUNCE_MS = 450;

/**
 * Surfaces whose editor owns its own undo stack. TipTap's history plugin
 * already tracks every keystroke with proper text-level granularity; running a
 * second stack beside it would make ctrl+Z ambiguous.
 */
const SURFACE_OWNS_HISTORY: Record<DocKind, boolean> = {
  text: true,
  canvas: false,
  deck: false,
  pdf: false,
};

const emptyPane = (): Pane => ({ docIds: [], activeDocId: null });

declare global {
  interface Window {
    /** Set before load to start with an empty workspace (used by the e2e suite). */
    __RR_NO_SEED__?: boolean;
  }
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

interface WorkspaceState {
  ready: boolean;
  docs: Record<string, Doc>;
  order: string[];
  panes: [Pane, Pane];
  splitView: boolean;
  activePane: PaneIndex;
  history: Record<string, { undo: HistoryEntry[]; redo: HistoryEntry[] }>;
  selection: Record<string, SurfaceSelection>;
  toasts: Toast[];
  aiPanelOpen: boolean;

  init: () => Promise<void>;
  commit: <K extends DocKind>(
    docId: string,
    ops: OpOf<K>[],
    options?: CommitOptions,
  ) => CommitResult;
  undo: (docId: string) => void;
  redo: (docId: string) => void;
  canUndo: (docId: string) => boolean;
  canRedo: (docId: string) => boolean;

  addDoc: (doc: Doc, options?: { open?: boolean }) => string;
  newDoc: (kind: DocKind, title?: string) => string;
  removeDoc: (docId: string) => Promise<void>;
  renameDoc: (docId: string, title: string) => void;
  duplicateDoc: (docId: string) => string | null;
  reorderDoc: (docId: string, toIndex: number) => void;
  replaceDoc: (doc: Doc) => void;

  openDoc: (docId: string, pane?: PaneIndex, options?: { focus?: boolean }) => void;
  closeDoc: (docId: string, pane: PaneIndex) => void;
  setActivePane: (pane: PaneIndex) => void;
  setSplitView: (split: boolean) => void;
  activeDocId: () => string | null;
  activeDoc: () => Doc | null;

  setSelection: (docId: string, selection: SurfaceSelection | null) => void;
  setCanvasViewport: (docId: string, viewport: CanvasBody["viewport"]) => void;

  toast: (tone: Toast["tone"], message: string) => void;
  dismissToast: (id: string) => void;
  setAiPanelOpen: (open: boolean) => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ready: false,
  docs: {},
  order: [],
  panes: [emptyPane(), emptyPane()],
  splitView: false,
  activePane: 0,
  history: {},
  selection: {},
  toasts: [],
  aiPanelOpen: true,

  init: async () => {
    if (get().ready) return;
    const { docs, order, broken } = await store.loadWorkspace();
    const byId: Record<string, Doc> = {};
    for (const doc of docs) byId[doc.id] = doc;

    const savedPanes = await store.readMeta<[Pane, Pane]>("panes");
    const savedSplit = await store.readMeta<boolean>("splitView");

    // Seed once, and only once: a user who deliberately empties their workspace
    // should not have the demo documents grow back on the next reload. The
    // window flag lets the e2e suite start from an empty workspace without
    // reaching into the database's internals.
    const seeded = await store.readMeta<boolean>("seeded");
    const suppressed = typeof window !== "undefined" && window.__RR_NO_SEED__ === true;
    if (!seeded && !suppressed && docs.length === 0) {
      const { seedDocuments } = await import("./seed");
      const seeds = seedDocuments();
      for (const doc of seeds) {
        byId[doc.id] = doc;
        order.push(doc.id);
        await store.saveDoc(doc);
      }
      await store.saveOrder(order);
      await store.writeMeta("seeded", true);

      const first = seeds[0];
      const panes: [Pane, Pane] = [
        { docIds: [first.id], activeDocId: first.id },
        { docIds: [], activeDocId: null },
      ];
      set({ ready: true, docs: byId, order, panes, splitView: false });
      await store.writeMeta("panes", panes);
      return;
    }

    const validPane = (pane: Pane | undefined): Pane => {
      const docIds = (pane?.docIds ?? []).filter((id) => byId[id]);
      const activeDocId =
        pane?.activeDocId && docIds.includes(pane.activeDocId)
          ? pane.activeDocId
          : (docIds[0] ?? null);
      return { docIds, activeDocId };
    };

    set({
      ready: true,
      docs: byId,
      order,
      panes: [validPane(savedPanes?.[0]), validPane(savedPanes?.[1])],
      splitView: Boolean(savedSplit),
    });

    if (broken.length) {
      get().toast(
        "error",
        `${broken.length} document${broken.length === 1 ? "" : "s"} could not be loaded and ${
          broken.length === 1 ? "was" : "were"
        } left untouched on disk.`,
      );
    }
  },

  commit: (docId, ops, options = {}) => {
    if (ops.length === 0) return { ok: true };
    const state = get();
    const doc = state.docs[docId];
    if (!doc) return { ok: false, error: `no document "${docId}"` };

    let next: Doc;
    let inverse: AnyOp[];
    try {
      const result = applyOps(doc as DocOf<DocKind>, ops as OpOf<DocKind>[]);
      next = result.doc;
      inverse = result.inverse as AnyOp[];
    } catch (err) {
      const message = err instanceof OpError ? err.message : String(err);
      return { ok: false, error: message };
    }

    const useHistory = !options.skipHistory && !SURFACE_OWNS_HISTORY[doc.kind];
    let history = state.history;

    if (useHistory) {
      const existing = history[docId] ?? { undo: [], redo: [] };
      const previous = existing.undo[existing.undo.length - 1];
      const entry: HistoryEntry = {
        inverse,
        forward: ops as AnyOp[],
        label: options.label ?? summarise(ops as AnyOp[]),
        coalesceKey: options.coalesceKey,
        at: Date.now(),
      };

      let undo: HistoryEntry[];
      if (
        options.coalesceKey &&
        previous?.coalesceKey === options.coalesceKey &&
        entry.at - previous.at < COALESCE_MS
      ) {
        // Merge into the previous step. Undoing the merged entry must reverse
        // this commit first, then the one it absorbed.
        undo = [
          ...existing.undo.slice(0, -1),
          {
            ...entry,
            inverse: [...inverse, ...previous.inverse],
            forward: [...previous.forward, ...(ops as AnyOp[])],
            label: previous.label,
          },
        ];
      } else {
        undo = [...existing.undo, entry].slice(-HISTORY_LIMIT);
      }

      history = { ...history, [docId]: { undo, redo: [] } };
    }

    set({ docs: { ...state.docs, [docId]: next }, history });
    scheduleSave(next);
    return { ok: true };
  },

  undo: (docId) => {
    const state = get();
    const entries = state.history[docId];
    const entry = entries?.undo[entries.undo.length - 1];
    const doc = state.docs[docId];
    if (!entry || !doc) return;

    try {
      const { doc: next } = applyOps(doc as DocOf<DocKind>, entry.inverse as OpOf<DocKind>[]);
      set({
        docs: { ...state.docs, [docId]: next },
        history: {
          ...state.history,
          [docId]: { undo: entries.undo.slice(0, -1), redo: [...entries.redo, entry] },
        },
      });
      scheduleSave(next);
    } catch (err) {
      // The stack is out of sync with the document; drop it rather than leave a
      // broken entry that fails forever.
      set({
        history: { ...state.history, [docId]: { undo: entries.undo.slice(0, -1), redo: [] } },
      });
      get().toast("error", `Could not undo: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  redo: (docId) => {
    const state = get();
    const entries = state.history[docId];
    const entry = entries?.redo[entries.redo.length - 1];
    const doc = state.docs[docId];
    if (!entry || !doc) return;

    try {
      const { doc: next, inverse } = applyOps(
        doc as DocOf<DocKind>,
        entry.forward as OpOf<DocKind>[],
      );
      set({
        docs: { ...state.docs, [docId]: next },
        history: {
          ...state.history,
          [docId]: {
            undo: [...entries.undo, { ...entry, inverse: inverse as AnyOp[] }],
            redo: entries.redo.slice(0, -1),
          },
        },
      });
      scheduleSave(next);
    } catch (err) {
      set({ history: { ...state.history, [docId]: { undo: entries.undo, redo: [] } } });
      get().toast("error", `Could not redo: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  canUndo: (docId) => (get().history[docId]?.undo.length ?? 0) > 0,
  canRedo: (docId) => (get().history[docId]?.redo.length ?? 0) > 0,

  addDoc: (doc, options = {}) => {
    const state = get();
    set({ docs: { ...state.docs, [doc.id]: doc }, order: [...state.order, doc.id] });
    void store.saveDoc(doc);
    void store.saveOrder([...state.order, doc.id]);
    if (options.open !== false) get().openDoc(doc.id);
    return doc.id;
  },

  newDoc: (kind, title) => get().addDoc(createDoc(kind, title)),

  removeDoc: async (docId) => {
    const state = get();
    const { [docId]: removed, ...rest } = state.docs;
    if (!removed) return;

    const panes = state.panes.map((pane) => {
      const docIds = pane.docIds.filter((id) => id !== docId);
      return {
        docIds,
        activeDocId: pane.activeDocId === docId ? (docIds[0] ?? null) : pane.activeDocId,
      };
    }) as [Pane, Pane];

    const order = state.order.filter((id) => id !== docId);
    const { [docId]: _h, ...history } = state.history;
    const { [docId]: _s, ...selection } = state.selection;

    set({ docs: rest, order, panes, history, selection });
    await store.deleteDocRow(docId);
    await store.saveOrder(order);
    void store.writeMeta("panes", panes);
    const freed = await store.collectOrphanBlobs(Object.values(rest));
    if (freed > 0) get().toast("info", `Removed ${freed} unused file${freed === 1 ? "" : "s"}.`);
  },

  renameDoc: (docId, title) => {
    const state = get();
    const doc = state.docs[docId];
    if (!doc || doc.title === title) return;
    const next = { ...doc, title, updatedAt: Date.now() };
    set({ docs: { ...state.docs, [docId]: next } });
    scheduleSave(next);
  },

  duplicateDoc: (docId) => {
    const state = get();
    const doc = state.docs[docId];
    if (!doc) return null;
    const copy = {
      ...structuredClone(doc),
      id: nid("doc"),
      title: `${doc.title} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as Doc;
    return get().addDoc(copy);
  },

  reorderDoc: (docId, toIndex) => {
    const state = get();
    const from = state.order.indexOf(docId);
    if (from === -1) return;
    const order = state.order.slice();
    const [moved] = order.splice(from, 1);
    order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, moved);
    set({ order });
    void store.saveOrder(order);
  },

  replaceDoc: (doc) => {
    set({ docs: { ...get().docs, [doc.id]: doc } });
    scheduleSave(doc);
  },

  openDoc: (docId, pane, options = {}) => {
    const state = get();
    if (!state.docs[docId]) return;
    const target: PaneIndex = pane ?? (state.splitView ? state.activePane : 0);
    const focus = options.focus !== false;

    const panes = state.panes.slice() as [Pane, Pane];
    const current = panes[target];
    panes[target] = {
      docIds: current.docIds.includes(docId) ? current.docIds : [...current.docIds, docId],
      activeDocId: docId,
    };

    // `focus: false` shows a document without moving the user to it. A recipe
    // that generates into the other pane uses this: stealing focus would swap
    // the assistant panel to the new document's (empty) conversation, hiding
    // the reply that is still streaming into the one the user asked from.
    set({
      panes,
      activePane: focus ? target : state.activePane,
      splitView: target === 1 ? true : state.splitView,
    });
    void store.writeMeta("panes", panes);
  },

  closeDoc: (docId, pane) => {
    const state = get();
    const panes = state.panes.slice() as [Pane, Pane];
    const current = panes[pane];
    const index = current.docIds.indexOf(docId);
    if (index === -1) return;

    const docIds = current.docIds.filter((id) => id !== docId);
    panes[pane] = {
      docIds,
      activeDocId:
        current.activeDocId === docId
          ? (docIds[Math.min(index, docIds.length - 1)] ?? null)
          : current.activeDocId,
    };

    // An emptied right pane collapses the split rather than leaving dead space.
    const splitView = pane === 1 && docIds.length === 0 ? false : state.splitView;
    set({ panes, splitView, activePane: splitView ? state.activePane : 0 });
    void store.writeMeta("panes", panes);
    void store.writeMeta("splitView", splitView);
  },

  setActivePane: (pane) => set({ activePane: pane }),

  setSplitView: (split) => {
    set({ splitView: split, activePane: split ? get().activePane : 0 });
    void store.writeMeta("splitView", split);
  },

  activeDocId: () => {
    const state = get();
    return state.panes[state.activePane].activeDocId;
  },

  activeDoc: () => {
    const id = get().activeDocId();
    return id ? (get().docs[id] ?? null) : null;
  },

  setSelection: (docId, selection) => {
    const current = get().selection;
    if (selection === null) {
      if (!(docId in current)) return;
      const { [docId]: _drop, ...rest } = current;
      set({ selection: rest });
      return;
    }
    set({ selection: { ...current, [docId]: selection } });
  },

  setCanvasViewport: (docId, viewport) => {
    const state = get();
    const doc = state.docs[docId];
    if (!doc || doc.kind !== "canvas") return;
    const next = { ...doc, body: { ...doc.body, viewport } };
    // Deliberately not a commit: panning is view state, not an edit, and must
    // not land on the undo stack or bump updatedAt.
    set({ docs: { ...state.docs, [docId]: next } });
    scheduleSave(next, 1500);
  },

  toast: (tone, message) => {
    const toast: Toast = { id: nid("t", 6), tone, message };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().dismissToast(toast.id), tone === "error" ? 8000 : 4000);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
}));

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced write-behind. Typing produces a commit per keystroke; without this
 * the app would issue an IndexedDB transaction per character.
 */
function scheduleSave(doc: Doc, delay = SAVE_DEBOUNCE_MS) {
  const existing = saveTimers.get(doc.id);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    doc.id,
    setTimeout(() => {
      saveTimers.delete(doc.id);
      const latest = useWorkspace.getState().docs[doc.id];
      if (latest) void store.saveDoc(latest);
    }, delay),
  );
}

/** Forces any pending writes to disk. Called before export and on page hide. */
export async function flushPendingSaves(): Promise<void> {
  const docs = useWorkspace.getState().docs;
  const pending = [...saveTimers.keys()];
  for (const id of pending) {
    const timer = saveTimers.get(id);
    if (timer) clearTimeout(timer);
    saveTimers.delete(id);
    const doc = docs[id];
    if (doc) await store.saveDoc(doc);
  }
}

/* ------------------------------------------------------------------ *
 * Blobs
 * ------------------------------------------------------------------ */

export async function storeBlob(file: Blob, name: string, mime?: string): Promise<string> {
  const id = newBlobId();
  await store.putBlob({
    id,
    name,
    mime: mime ?? file.type ?? "application/octet-stream",
    data: file,
    createdAt: Date.now(),
  });
  return id;
}

export async function loadBlob(id: string): Promise<Blob | null> {
  const row = await store.getBlob(id);
  return row?.data ?? null;
}

function summarise(ops: AnyOp[]): string {
  if (ops.length === 1) return describeOperation(ops[0]);
  return `${ops.length} changes`;
}
