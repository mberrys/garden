import { describe, expect, it } from "vitest";
import { createDatabaseDoc, createTextDoc } from "@/lib/docs/factories";
import { applyPlan, previewPlan, type WorkspacePlan, type WorkspaceSnapshot } from "./transaction";

function emptySnapshot(): WorkspaceSnapshot {
  return {
    docs: {},
    order: [],
    panes: [
      { docIds: [], activeDocId: null },
      { docIds: [], activeDocId: null },
    ],
    splitView: false,
    seedPacketId: null,
    seedPacketVersion: null,
    flavorId: null,
  };
}

describe("workspace transactions", () => {
  it("creates multiple docs and restores them with one inverse", () => {
    const a = createTextDoc("Brief");
    const b = createDatabaseDoc("Stories");
    const plan: WorkspacePlan = {
      id: "tx_1",
      label: "Plant campaign",
      changes: [
        { type: "createDoc", doc: a },
        { type: "createDoc", doc: b },
        {
          type: "setLayout",
          panes: [
            { docIds: [a.id], activeDocId: a.id },
            { docIds: [b.id], activeDocId: b.id },
          ],
          splitView: true,
        },
        { type: "setPacketBinding", packetId: "comms/campaign", version: 1 },
      ],
    };

    const preview = previewPlan(plan, emptySnapshot());
    expect(preview.creates.map((c) => c.title)).toEqual(["Brief", "Stories"]);
    expect(preview.layout).toBe(true);
    expect(preview.packetBinding?.packetId).toBe("comms/campaign");

    const applied = applyPlan(plan, emptySnapshot());
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(Object.keys(applied.snapshot.docs)).toHaveLength(2);
    expect(applied.snapshot.splitView).toBe(true);

    const undone = applyPlan(applied.inverse, applied.snapshot);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(Object.keys(undone.snapshot.docs)).toHaveLength(0);
    expect(undone.snapshot.splitView).toBe(false);
    expect(undone.snapshot.seedPacketId).toBeNull();
  });

  it("applies nothing when one child op is invalid", () => {
    const doc = createTextDoc("Notes", "hello");
    const snapshot: WorkspaceSnapshot = {
      ...emptySnapshot(),
      docs: { [doc.id]: doc },
      order: [doc.id],
    };
    const sibling = createTextDoc("Other");
    const result = applyPlan(
      {
        id: "tx_bad",
        label: "Mixed",
        changes: [
          { type: "createDoc", doc: sibling },
          { type: "applyOps", docId: doc.id, ops: [{ op: "addNode", node: { kind: "rect" } }] },
        ],
      },
      snapshot,
    );
    expect(result.ok).toBe(false);
    expect(snapshot.docs[sibling.id]).toBeUndefined();
    expect(snapshot.docs[doc.id]?.title).toBe("Notes");
  });

  it("restores a deleted document on undo, including references", () => {
    const doc = createTextDoc("Source");
    const snapshot: WorkspaceSnapshot = {
      ...emptySnapshot(),
      docs: { [doc.id]: doc },
      order: [doc.id],
      panes: [
        { docIds: [doc.id], activeDocId: doc.id },
        { docIds: [], activeDocId: null },
      ],
    };
    const applied = applyPlan(
      { id: "tx_del", label: "Delete", changes: [{ type: "deleteDoc", docId: doc.id }] },
      snapshot,
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docs[doc.id]).toBeUndefined();

    const undone = applyPlan(applied.inverse, applied.snapshot);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docs[doc.id]?.title).toBe("Source");
    expect(undone.snapshot.order).toContain(doc.id);
  });
});
