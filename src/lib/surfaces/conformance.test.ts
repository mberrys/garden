import { describe, expect, it } from "vitest";
import { runAdapterConformance, type AdapterConformanceHooks } from "./conformance";
import {
  createStubDoc,
  stubSurfaceDefinition,
  type StubBody,
  type StubDoc,
  type StubEditorAdapter,
  type StubOp,
  type StubSelection,
} from "./stub";
import { nid } from "@/lib/docs/ids";

const stubConformanceHooks: AdapterConformanceHooks<
  "stub",
  StubBody,
  StubOp,
  StubSelection,
  StubDoc,
  StubEditorAdapter
> = {
  definition: stubSurfaceDefinition,
  createInitialDoc: () => createStubDoc(),
  getAdapter: (session) => session.getAdapter() as StubEditorAdapter,
  simulateUserEdit: (_session, adapter) => adapter.simulateAddItem("Conformance item"),
  mutateEngineOnly: (adapter) => adapter.mutateEngineOnly(),
  engineUndo: (adapter) => adapter.engineUndo(),
  sampleSelection: { index: 0 },
  sampleAiOps: (_doc: StubDoc): StubOp[] => [
    { op: "addItem", id: nid("ai"), text: "AI suggestion", done: false },
  ],
};

describe("adapter conformance", () => {
  runAdapterConformance(stubConformanceHooks);
});

describe("builtin surface contracts", () => {
  it("covers every DocKind", async () => {
    const { DOC_KINDS } = await import("@/lib/docs/schema");
    const { BUILTIN_SURFACE_CONTRACTS } = await import("./builtins");
    for (const kind of DOC_KINDS) {
      expect(BUILTIN_SURFACE_CONTRACTS[kind].ownsHistory).toBe(false);
    }
  });
});
