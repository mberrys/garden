import { describe, expect, it } from "vitest";
import { createTextDoc } from "@/lib/docs/factories";
import { runAdapterConformance, type ConformanceSpec } from "@/lib/surfaces/conformance";
import type { TextDoc } from "@/lib/docs/schema";
import type { TextOp } from "@/lib/ops";
import type { SurfaceSelection } from "@/lib/store/workspace";
import {
  applyTextAdapterOps,
  createTextAdapter,
  serializeTextAdapterDoc,
  serializeTextSelection,
  type TextIntent,
} from "./writer-adapter";

function spec(): ConformanceSpec<TextDoc, TextOp, SurfaceSelection, TextIntent> {
  const initial = createTextDoc("Notes", "Hello");
  return {
    create: createTextAdapter,
    applyOps: applyTextAdapterOps,
    serializeDoc: serializeTextAdapterDoc,
    serializeSelection: serializeTextSelection,
    initialDoc: initial,
    userEdit: { intent: { type: "type", markdown: "Hello world" } },
    gardenOps: [{ op: "replaceDoc", markdown: "From Garden" }],
    selection: { kind: "text", blockIndex: 0, blockCount: 1, text: "Hello" },
    pendingAiOps: [{ op: "insertMarkdown", index: 0, markdown: "## Outline" }],
  };
}

describe("writer adapter", () => {
  runAdapterConformance(spec(), it);

  it("does not persist caret pixels", () => {
    const adapter = createTextAdapter();
    adapter.mount(createTextDoc());
    expect(JSON.stringify(adapter.readEngineEphemeral())).toContain("caretPx");
    expect(JSON.stringify(serializeTextAdapterDoc(createTextDoc()))).not.toContain("caretPx");
  });
});
