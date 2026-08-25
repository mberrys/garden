import { describe, expect, it } from "vitest";
import { createCanvasDoc } from "@/lib/docs/factories";
import { runAdapterConformance, type ConformanceSpec } from "@/lib/surfaces/conformance";
import type { CanvasDoc } from "@/lib/docs/schema";
import type { CanvasOp } from "@/lib/ops";
import type { SurfaceSelection } from "@/lib/store/workspace";
import {
  applyCanvasAdapterOps,
  createCanvasAdapter,
  serializeCanvasAdapterDoc,
  serializeCanvasSelection,
  type CanvasIntent,
} from "./drawing-adapter";

function spec(): ConformanceSpec<CanvasDoc, CanvasOp, SurfaceSelection, CanvasIntent> {
  const initial = createCanvasDoc("Sketch");
  return {
    create: createCanvasAdapter,
    applyOps: applyCanvasAdapterOps,
    serializeDoc: serializeCanvasAdapterDoc,
    serializeSelection: serializeCanvasSelection,
    initialDoc: initial,
    userEdit: { intent: { type: "addRect", x: 10, y: 20 } },
    gardenOps: [{ op: "setBackground", background: "dots" }],
    selection: { kind: "canvas", nodeIds: [] },
    pendingAiOps: [{ op: "addNode", node: { kind: "ellipse", x: 0, y: 0, w: 40, h: 40 } }],
  };
}

describe("drawing adapter", () => {
  runAdapterConformance(spec(), it);

  it("does not persist pan pixels", () => {
    const adapter = createCanvasAdapter();
    adapter.mount(createCanvasDoc());
    expect(JSON.stringify(adapter.readEngineEphemeral())).toContain("panPx");
    expect(JSON.stringify(serializeCanvasAdapterDoc(createCanvasDoc()))).not.toContain("panPx");
  });
});
