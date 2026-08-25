import { describe, expect, it } from "vitest";
import "@/lib/surfaces";
import { applyPlan } from "@/lib/store/transaction";
import { WORKSPACE_RECIPES } from "./workspace-recipes";

describe("workspace recipes", () => {
  it("ships two multi-doc recipes that preview and apply atomically", () => {
    expect(WORKSPACE_RECIPES).toHaveLength(2);
    for (const recipe of WORKSPACE_RECIPES) {
      const plan = recipe.plan({});
      expect(plan.changes.some((c) => c.type === "createDoc")).toBe(true);
      const empty = {
        docs: {},
        order: [],
        panes: [
          { docIds: [], activeDocId: null },
          { docIds: [], activeDocId: null },
        ] as [{ docIds: string[]; activeDocId: string | null }, { docIds: string[]; activeDocId: string | null }],
        splitView: false,
        seedPacketId: null,
        seedPacketVersion: null,
        flavorId: null,
      };
      const applied = applyPlan(plan, empty);
      expect(applied.ok, recipe.id).toBe(true);
      if (!applied.ok) return;
      const undone = applyPlan(applied.inverse, applied.snapshot);
      expect(undone.ok).toBe(true);
      if (!undone.ok) return;
      expect(Object.keys(undone.snapshot.docs)).toHaveLength(0);
    }
  });
});
