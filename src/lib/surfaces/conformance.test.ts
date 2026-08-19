import { describe, expect, it } from "vitest";
import { allKinds } from ".";
import {
  evaluateAdapterConformance,
  runAdapterConformance,
  type ConformanceSpec,
} from "./conformance";
import {
  applyStubBodyOps,
  applyStubDocOps,
  createStubAdapter,
  createStubDoc,
  serializeStubDoc,
  serializeStubSelection,
  type StubAdapter,
  type StubDoc,
  type StubIntent,
  type StubOp,
  type StubSelection,
} from "./stub-adapter";

function stubSpec(): ConformanceSpec<StubDoc, StubOp, StubSelection, StubIntent> {
  return {
    create: createStubAdapter,
    applyOps: applyStubDocOps,
    serializeDoc: serializeStubDoc,
    serializeSelection: serializeStubSelection,
    initialDoc: createStubDoc(),
    userEdit: { intent: { type: "appendItem", text: "hello" } },
    gardenOps: [{ op: "setTitle", title: "From Garden" }],
    selection: { target: "title" },
    pendingAiOps: [{ op: "insertItem", index: 0, text: "from AI" }],
  };
}

describe("stub adapter", () => {
  runAdapterConformance(stubSpec(), it);

  it("round-trips ops through the stub reducer", () => {
    const body = { title: "A", items: ["x"] };
    const { body: next, inverse } = applyStubBodyOps(body, [
      { op: "insertItem", index: 1, text: "y" },
    ]);
    expect(next).toEqual({ title: "A", items: ["x", "y"] });
    const back = applyStubBodyOps(next, inverse);
    expect(back.body).toEqual(body);
  });

  it("is not a registered DocKind", () => {
    expect(createStubDoc().kind).toBe("stub");
    expect((allKinds() as string[]).includes("stub")).toBe(false);
  });
});

function createEchoingAdapter(): StubAdapter {
  const adapter = createStubAdapter();
  const originalUpdate = adapter.update.bind(adapter);
  adapter.update = (doc: StubDoc) => {
    originalUpdate(doc);
    adapter.simulateUserEdit({ type: "appendItem", text: "echo" });
  };
  return adapter;
}

function createEngineHistoryAdapter(): StubAdapter {
  const adapter = createStubAdapter();
  adapter.engineOwnsHistory = () => true;
  return adapter;
}

describe("conformance harness fails a misbehaving adapter", () => {
  it("fails when update re-emits ops", () => {
    const report = evaluateAdapterConformance({
      ...stubSpec(),
      create: createEchoingAdapter,
    });
    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.case)).toContain("noFeedbackLoop");
    const loop = report.failures.find((failure) => failure.case === "noFeedbackLoop");
    expect(loop?.message).toMatch(/feedback loop/i);
  });

  it("fails when the engine owns undo", () => {
    const report = evaluateAdapterConformance({
      ...stubSpec(),
      create: createEngineHistoryAdapter,
    });
    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.case)).toContain("gardenOwnsUndo");
    const undo = report.failures.find((failure) => failure.case === "gardenOwnsUndo");
    expect(undo?.message).toMatch(/engine owns undo/i);
  });
});
