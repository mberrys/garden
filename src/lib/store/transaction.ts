import type { Doc, DocKind } from "@/lib/docs/schema";
import { applyOps, type AnyOp, type OpOf } from "@/lib/ops";
import { OpError } from "@/lib/ops/errors";

export interface TransactionPane {
  docIds: string[];
  activeDocId: string | null;
}

export interface WorkspaceSnapshot {
  docs: Record<string, Doc>;
  order: string[];
  panes: [TransactionPane, TransactionPane];
  splitView: boolean;
  seedPacketId: string | null;
  seedPacketVersion: number | null;
  flavorId: string | null;
}

export type WorkspaceChange =
  | { type: "createDoc"; doc: Doc }
  | { type: "deleteDoc"; docId: string }
  | { type: "applyOps"; docId: string; ops: AnyOp[] }
  | { type: "renameDoc"; docId: string; title: string }
  | { type: "setLayout"; panes: [TransactionPane, TransactionPane]; splitView: boolean }
  | { type: "setPacketBinding"; packetId: string | null; version: number | null }
  | { type: "setFlavor"; flavorId: string | null };

export interface WorkspacePlan {
  id: string;
  label: string;
  changes: WorkspaceChange[];
}

export interface PlanPreview {
  label: string;
  creates: { kind: DocKind; title: string }[];
  deletes: { id: string; title: string }[];
  updates: { id: string; title: string; opCount: number }[];
  layout: boolean;
  packetBinding: { packetId: string | null; version: number | null } | null;
  flavor: string | null;
}

export type PlanResult =
  | { ok: true; snapshot: WorkspaceSnapshot; inverse: WorkspacePlan }
  | { ok: false; error: string };

export function previewPlan(plan: WorkspacePlan, snapshot: WorkspaceSnapshot): PlanPreview {
  const creates: PlanPreview["creates"] = [];
  const deletes: PlanPreview["deletes"] = [];
  const updates: PlanPreview["updates"] = [];
  let layout = false;
  let packetBinding: PlanPreview["packetBinding"] = null;
  let flavor: string | null = null;

  for (const change of plan.changes) {
    switch (change.type) {
      case "createDoc":
        creates.push({ kind: change.doc.kind, title: change.doc.title });
        break;
      case "deleteDoc": {
        const doc = snapshot.docs[change.docId];
        deletes.push({ id: change.docId, title: doc?.title ?? change.docId });
        break;
      }
      case "applyOps": {
        const doc = snapshot.docs[change.docId];
        updates.push({
          id: change.docId,
          title: doc?.title ?? change.docId,
          opCount: change.ops.length,
        });
        break;
      }
      case "renameDoc": {
        const doc = snapshot.docs[change.docId];
        updates.push({ id: change.docId, title: doc?.title ?? change.docId, opCount: 0 });
        break;
      }
      case "setLayout":
        layout = true;
        break;
      case "setPacketBinding":
        packetBinding = { packetId: change.packetId, version: change.version };
        break;
      case "setFlavor":
        flavor = change.flavorId;
        break;
      default: {
        const _exhaustive: never = change;
        void _exhaustive;
      }
    }
  }

  return { label: plan.label, creates, deletes, updates, layout, packetBinding, flavor };
}

export function applyPlan(plan: WorkspacePlan, snapshot: WorkspaceSnapshot): PlanResult {
  const next: WorkspaceSnapshot = {
    docs: { ...snapshot.docs },
    order: [...snapshot.order],
    panes: [
      { docIds: [...snapshot.panes[0].docIds], activeDocId: snapshot.panes[0].activeDocId },
      { docIds: [...snapshot.panes[1].docIds], activeDocId: snapshot.panes[1].activeDocId },
    ],
    splitView: snapshot.splitView,
    seedPacketId: snapshot.seedPacketId,
    seedPacketVersion: snapshot.seedPacketVersion,
    flavorId: snapshot.flavorId,
  };
  const inverseChanges: WorkspaceChange[] = [];

  try {
    for (const change of plan.changes) {
      switch (change.type) {
        case "createDoc": {
          if (next.docs[change.doc.id]) {
            throw new OpError(`createDoc: "${change.doc.id}" already exists`);
          }
          next.docs[change.doc.id] = change.doc;
          next.order.push(change.doc.id);
          inverseChanges.push({ type: "deleteDoc", docId: change.doc.id });
          break;
        }
        case "deleteDoc": {
          const existing = next.docs[change.docId];
          if (!existing) throw new OpError(`deleteDoc: no document "${change.docId}"`);
          const { [change.docId]: _drop, ...rest } = next.docs;
          next.docs = rest;
          next.order = next.order.filter((id) => id !== change.docId);
          next.panes = next.panes.map((pane) => {
            const docIds = pane.docIds.filter((id) => id !== change.docId);
            return {
              docIds,
              activeDocId: pane.activeDocId === change.docId ? (docIds[0] ?? null) : pane.activeDocId,
            };
          }) as [TransactionPane, TransactionPane];
          inverseChanges.push({ type: "createDoc", doc: existing });
          break;
        }
        case "applyOps": {
          const doc = next.docs[change.docId];
          if (!doc) throw new OpError(`applyOps: no document "${change.docId}"`);
          const result = applyOps(doc as DocOfKind, change.ops as OpOf<DocKind>[]);
          next.docs[change.docId] = result.doc;
          inverseChanges.push({
            type: "applyOps",
            docId: change.docId,
            ops: result.inverse as AnyOp[],
          });
          break;
        }
        case "renameDoc": {
          const doc = next.docs[change.docId];
          if (!doc) throw new OpError(`renameDoc: no document "${change.docId}"`);
          inverseChanges.push({ type: "renameDoc", docId: change.docId, title: doc.title });
          next.docs[change.docId] = { ...doc, title: change.title, updatedAt: Date.now() };
          break;
        }
        case "setLayout": {
          inverseChanges.push({
            type: "setLayout",
            panes: [
              { docIds: [...next.panes[0].docIds], activeDocId: next.panes[0].activeDocId },
              { docIds: [...next.panes[1].docIds], activeDocId: next.panes[1].activeDocId },
            ],
            splitView: next.splitView,
          });
          next.panes = [
            { docIds: [...change.panes[0].docIds], activeDocId: change.panes[0].activeDocId },
            { docIds: [...change.panes[1].docIds], activeDocId: change.panes[1].activeDocId },
          ];
          next.splitView = change.splitView;
          break;
        }
        case "setPacketBinding": {
          inverseChanges.push({
            type: "setPacketBinding",
            packetId: next.seedPacketId,
            version: next.seedPacketVersion,
          });
          next.seedPacketId = change.packetId;
          next.seedPacketVersion = change.version;
          break;
        }
        case "setFlavor": {
          inverseChanges.push({ type: "setFlavor", flavorId: next.flavorId });
          next.flavorId = change.flavorId;
          break;
        }
        default: {
          const _exhaustive: never = change;
          throw new OpError(`unknown workspace change: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof OpError ? err.message : err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: true,
    snapshot: next,
    inverse: {
      id: `${plan.id}-inv`,
      label: `Undo ${plan.label}`,
      changes: inverseChanges.reverse(),
    },
  };
}

type DocOfKind = Parameters<typeof applyOps>[0];
