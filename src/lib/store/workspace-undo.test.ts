import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTextDoc } from "@/lib/docs/factories";
import { newPlanId } from "@/lib/docs/ids";
import type { WorkspacePlan } from "./transaction";
import { useWorkspace } from "./workspace";

vi.mock("./db", () => ({
  loadWorkspace: vi.fn(async () => ({ docs: [], order: [], broken: [] })),
  readMeta: vi.fn(async () => undefined),
  writeMeta: vi.fn(async () => undefined),
  saveDoc: vi.fn(async () => undefined),
  saveOrder: vi.fn(async () => undefined),
  deleteDocRow: vi.fn(async () => undefined),
  putBlob: vi.fn(async () => undefined),
}));

describe("workspace tx undo/redo", () => {
  beforeEach(() => {
    useWorkspace.setState({
      ready: true,
      docs: {},
      order: [],
      panes: [
        { docIds: [], activeDocId: null },
        { docIds: [], activeDocId: null },
      ],
      splitView: false,
      activePane: 0,
      history: {},
      selection: {},
      toasts: [],
      lastAction: null,
      txUndo: [],
      txRedo: [],
      pendingPlan: null,
      seedPacketId: null,
      seedPacketVersion: null,
      flavorId: null,
    });
  });

  it("redoes a workspace transaction after undo", () => {
    const doc = createTextDoc("Brief");
    const plan: WorkspacePlan = {
      id: newPlanId(),
      label: "Plant brief",
      changes: [
        { type: "createDoc", doc },
        {
          type: "setLayout",
          panes: [
            { docIds: [doc.id], activeDocId: doc.id },
            { docIds: [], activeDocId: null },
          ],
          splitView: false,
        },
      ],
    };

    const store = useWorkspace.getState();
    expect(store.applyTransaction(plan).ok).toBe(true);
    expect(useWorkspace.getState().docs[doc.id]?.title).toBe("Brief");

    store.undo(doc.id);
    expect(useWorkspace.getState().docs[doc.id]).toBeUndefined();
    expect(useWorkspace.getState().canRedo(doc.id)).toBe(true);

    useWorkspace.getState().redo(doc.id);
    expect(useWorkspace.getState().docs[doc.id]?.title).toBe("Brief");
    expect(useWorkspace.getState().panes[0].activeDocId).toBe(doc.id);
  });
});
