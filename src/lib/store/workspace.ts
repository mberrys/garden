"use client";

import { create } from "zustand";
import type { CanvasBody, Doc, DocKind, DocOf } from "@/lib/docs/schema";
import { createDoc } from "@/lib/docs/factories";
import { applyOps, describeOperation, type AnyOp, type OpOf } from "@/lib/ops";
import { OpError } from "@/lib/ops/errors";
import { newBlobId, nid, newPlanId } from "@/lib/docs/ids";
import { getPacket } from "@/lib/packets/registry";
import { sproutPacket } from "@/lib/packets/sprout";
import "@/lib/surfaces";
import { getSurface } from "@/lib/surfaces/registry";
import * as store from "./db";
import {
  applyPlan,
  previewPlan,
  type WorkspacePlan,
  type WorkspaceSnapshot,
} from "./transaction";

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
  | { kind: "pdf"; page: number; text: string; annotationId: string | null }
  | { kind: "sheet"; cell: string | null; range: string | null }
  | { kind: "database"; rowId: string | null; fieldId: string | null }
  | { kind: "media"; assetId: string | null }
  | { kind: "mini"; recordId: string | null; fieldId: string | null };

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

const emptyPane = (): Pane => ({ docIds: [], activeDocId: null });

declare global {
  interface Window {
    /** Set before load to start with an empty workspace (used by the e2e suite). */
    __GARDEN_NO_SEED__?: boolean;
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
  /** Packet that sprouted this workspace, if any. */
  seedPacketId: string | null;
  /** Version of the packet that sprouted this workspace. */
  seedPacketVersion: number | null;
  /** Reversible flavor lens (view-state only). */
  flavorId: string | null;
  /** Last workspace-level action, so undo can reverse a multi-doc transaction. */
  lastAction: { type: "doc"; docId: string } | { type: "tx" } | null;
  txUndo: WorkspacePlan[];
  txRedo: WorkspacePlan[];
  pendingPlan: { plan: WorkspacePlan; preview: ReturnType<typeof previewPlan> } | null;
  /** User chose "start blank" on an empty workspace. */
  blankWorkspace: boolean;
  /** e2e flag: do not auto-plant and do not show the picker. */
  seedSuppressed: boolean;
  /** User asked to see the picker (empty blank workspace, or New menu). */
  packetPickerRequested: boolean;

  init: () => Promise<void>;
  plantPacket: (id: string) => Promise<void>;
  startBlankWorkspace: () => Promise<void>;
  requestPacketPicker: () => void;
  applyTransaction: (plan: WorkspacePlan) => { ok: boolean; error?: string };
  previewTransaction: (plan: WorkspacePlan) => ReturnType<typeof previewPlan>;
  setFlavor: (flavorId: string | null) => void;
  proposePlan: (plan: WorkspacePlan) => void;
  dismissPlan: () => void;
  acceptPlan: () => { ok: boolean; error?: string };
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
  seedPacketId: null,
  seedPacketVersion: null,
  flavorId: null,
  lastAction: null,
  txUndo: [],
  txRedo: [],
  pendingPlan: null,
  blankWorkspace: false,
  seedSuppressed: false,
  packetPickerRequested: false,

  init: async () => {
    if (get().ready) return;
    const { docs, order, broken } = await store.loadWorkspace();
    const byId: Record<string, Doc> = {};
    for (const doc of docs) byId[doc.id] = doc;

    const savedPanes = await store.readMeta<[Pane, Pane]>("panes");
    const savedSplit = await store.readMeta<boolean>("splitView");
    const savedPacketId = await store.readMeta<string | null>("seedPacketId");
    const savedPacketVersion = await store.readMeta<number | null>("seedPacketVersion");
    const savedBlank = await store.readMeta<boolean>("blankWorkspace");
    const savedFlavor = await store.readMeta<string | null>("flavorId");
    const suppressed = typeof window !== "undefined" && window.__GARDEN_NO_SEED__ === true;

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
      seedPacketId: savedPacketId ?? null,
      seedPacketVersion: savedPacketVersion ?? null,
      flavorId: savedFlavor ?? null,
      blankWorkspace: Boolean(savedBlank),
      seedSuppressed: suppressed,
      packetPickerRequested: false,
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

  plantPacket: async (id) => {
    const packet = getPacket(id);
    if (!packet) {
      get().toast("error", `Unknown seed packet "${id}".`);
      return;
    }

    const sprouted = sproutPacket(packet);
    const plan: WorkspacePlan = {
      id: newPlanId(),
      label: `Plant ${packet.label}`,
      changes: [
        ...sprouted.docs.map((doc) => ({ type: "createDoc" as const, doc })),
        {
          type: "setLayout",
          panes: sprouted.panes,
          splitView: sprouted.splitView,
        },
        { type: "setPacketBinding", packetId: id, version: packet.version },
      ],
    };
    const result = get().applyTransaction(plan);
    if (!result.ok) {
      get().toast("error", result.error ?? "Could not plant packet.");
      return;
    }
    await store.writeMeta("blankWorkspace", false);
    await store.writeMeta("seeded", true);
    set({ blankWorkspace: false, packetPickerRequested: false, activePane: 0 });
  },

  startBlankWorkspace: async () => {
    await store.writeMeta("blankWorkspace", true);
    await store.writeMeta("seedPacketId", null);
    await store.writeMeta("seedPacketVersion", null);
    await store.writeMeta("seeded", true);
    set({
      seedPacketId: null,
      seedPacketVersion: null,
      blankWorkspace: true,
      packetPickerRequested: false,
    });
  },

  requestPacketPicker: () => set({ packetPickerRequested: true }),

  previewTransaction: (plan) => previewPlan(plan, snapshotOf(get())),

  proposePlan: (plan) => {
    set({ pendingPlan: { plan, preview: previewPlan(plan, snapshotOf(get())) } });
  },

  dismissPlan: () => set({ pendingPlan: null }),

  acceptPlan: () => {
    const pending = get().pendingPlan;
    if (!pending) return { ok: false, error: "no pending plan" };
    const result = get().applyTransaction(pending.plan);
    if (result.ok) set({ pendingPlan: null });
    return result;
  },

  setFlavor: (flavorId) => {
    const result = get().applyTransaction({
      id: newPlanId(),
      label: "Switch flavor",
      changes: [{ type: "setFlavor", flavorId }],
    });
    if (result.ok) void store.writeMeta("flavorId", flavorId);
  },

  applyTransaction: (plan) => {
    const state = get();
    const result = applyPlan(plan, snapshotOf(state));
    if (!result.ok) return { ok: false, error: result.error };

    const created = plan.changes.filter((c) => c.type === "createDoc");
    const deleted = plan.changes.filter((c) => c.type === "deleteDoc");

    set({
      docs: result.snapshot.docs,
      order: result.snapshot.order,
      panes: result.snapshot.panes,
      splitView: result.snapshot.splitView,
      seedPacketId: result.snapshot.seedPacketId,
      seedPacketVersion: result.snapshot.seedPacketVersion,
      flavorId: result.snapshot.flavorId,
      lastAction: { type: "tx" },
      txUndo: [...state.txUndo, result.inverse].slice(-HISTORY_LIMIT),
      txRedo: [],
    });

    void persistSnapshot(result.snapshot);
    for (const change of created) {
      if (change.type === "createDoc") void store.saveDoc(change.doc);
    }
    for (const change of deleted) {
      if (change.type === "deleteDoc") void store.deleteDocRow(change.docId);
    }
    return { ok: true };
  },

  commit: (docId, ops, options = {}) => {
    if (ops.length === 0) return { ok: true };
    const state = get();
    const doc = state.docs[docId];
    if (!doc) return { ok: false, error: `no document "${docId}"` };

    let next: Doc;
    let inverse: AnyOp[];
    try {
      const surface = getSurface(doc.kind);
      const result = surface.applyOps(doc.body, ops);
      next = { ...doc, body: result.body, updatedAt: Date.now() };
      inverse = result.inverse as AnyOp[];
    } catch (err) {
      const message = err instanceof OpError ? err.message : String(err);
      return { ok: false, error: message };
    }

    const useHistory = !options.skipHistory && !getSurface(doc.kind).ownsHistory;
    let history = state.history;

    if (useHistory) {
      const existing = history[docId] ?? { undo: [], redo: [] };
      const previous = existing.undo[existing.undo.length - 1];
      const entry: HistoryEntry = {
        inverse,
        forward: ops as unknown as AnyOp[],
        label: options.label ?? summarise(ops as unknown as AnyOp[]),
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
            forward: [...previous.forward, ...(ops as unknown as AnyOp[])],
            label: previous.label,
          },
        ];
      } else {
        undo = [...existing.undo, entry].slice(-HISTORY_LIMIT);
      }

      history = { ...history, [docId]: { undo, redo: [] } };
    }

    set({ docs: { ...state.docs, [docId]: next }, history, lastAction: { type: "doc", docId } });
    scheduleSave(next);
    return { ok: true };
  },

  undo: (docId) => {
    const state = get();
    if (state.lastAction?.type === "tx") {
      const inverse = state.txUndo[state.txUndo.length - 1];
      if (!inverse) return;
      const result = applyPlan(inverse, snapshotOf(state));
      if (!result.ok) {
        get().toast("error", `Could not undo: ${result.error}`);
        return;
      }
      set({
        docs: result.snapshot.docs,
        order: result.snapshot.order,
        panes: result.snapshot.panes,
        splitView: result.snapshot.splitView,
        seedPacketId: result.snapshot.seedPacketId,
        seedPacketVersion: result.snapshot.seedPacketVersion,
        flavorId: result.snapshot.flavorId,
        txUndo: state.txUndo.slice(0, -1),
        txRedo: [...state.txRedo, result.inverse],
        lastAction: state.txUndo.length > 1 ? { type: "tx" } : null,
      });
      void persistSnapshot(result.snapshot);
      return;
    }

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
      set({
        history: { ...state.history, [docId]: { undo: entries.undo.slice(0, -1), redo: [] } },
      });
      get().toast("error", `Could not undo: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  redo: (docId) => {
    const state = get();
    if (state.txRedo.length > 0 && state.lastAction?.type !== "doc") {
      const forward = state.txRedo[state.txRedo.length - 1];
      const result = applyPlan(forward, snapshotOf(state));
      if (!result.ok) {
        get().toast("error", `Could not redo: ${result.error}`);
        return;
      }
      set({
        docs: result.snapshot.docs,
        order: result.snapshot.order,
        panes: result.snapshot.panes,
        splitView: result.snapshot.splitView,
        seedPacketId: result.snapshot.seedPacketId,
        seedPacketVersion: result.snapshot.seedPacketVersion,
        flavorId: result.snapshot.flavorId,
        txUndo: [...state.txUndo, result.inverse],
        txRedo: state.txRedo.slice(0, -1),
        lastAction: { type: "tx" },
      });
      void persistSnapshot(result.snapshot);
      return;
    }

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

  canUndo: (docId) =>
    (get().lastAction?.type === "tx" && get().txUndo.length > 0) ||
    (get().history[docId]?.undo.length ?? 0) > 0,
  canRedo: (docId) =>
    (get().txRedo.length > 0 && get().lastAction?.type !== "doc") ||
    (get().history[docId]?.redo.length ?? 0) > 0,

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

export function snapshotOf(state: {
  docs: Record<string, Doc>;
  order: string[];
  panes: [Pane, Pane];
  splitView: boolean;
  seedPacketId: string | null;
  seedPacketVersion: number | null;
  flavorId: string | null;
}): WorkspaceSnapshot {
  return {
    docs: state.docs,
    order: state.order,
    panes: state.panes,
    splitView: state.splitView,
    seedPacketId: state.seedPacketId,
    seedPacketVersion: state.seedPacketVersion,
    flavorId: state.flavorId,
  };
}

async function persistSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  await store.saveOrder(snapshot.order);
  await store.writeMeta("panes", snapshot.panes);
  await store.writeMeta("splitView", snapshot.splitView);
  await store.writeMeta("seedPacketId", snapshot.seedPacketId);
  await store.writeMeta("seedPacketVersion", snapshot.seedPacketVersion);
  await store.writeMeta("flavorId", snapshot.flavorId);
  for (const doc of Object.values(snapshot.docs)) {
    await store.saveDoc(doc);
  }
}

/** Empty workspace shows the packet picker unless the user chose blank or e2e suppressed it. */
export function workspaceShowsPacketPicker(state: {
  seedSuppressed: boolean;
  order: string[];
  blankWorkspace: boolean;
  packetPickerRequested: boolean;
}): boolean {
  if (state.seedSuppressed || state.order.length > 0) return false;
  return !state.blankWorkspace || state.packetPickerRequested;
}
