import { describe, expect, it } from "vitest";
import type { TextDoc } from "@/lib/docs/schema";
import type { TextOp } from "@/lib/ops/text";
import {
  getSurface,
  runAdapterConformance,
  type AdapterDriver,
  type ConformanceSpec,
  type EditorAdapter,
  type TestAdapter,
} from ".";

type TextSelection = { blockIndex: number };
type TextIntent = { type: "insertMarkdown"; markdown: string };
type TextEphemeral = { cursorPx: number; draft: string };

const EMPTY_EPHEMERAL: TextEphemeral = { cursorPx: 0, draft: "" };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function serializeTextDoc(doc: TextDoc): unknown {
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
  };
}

function serializeTextSelection(selection: TextSelection): unknown {
  return { blockIndex: selection.blockIndex };
}

function fingerprint(doc: TextDoc): string {
  return JSON.stringify(serializeTextDoc(doc));
}

function applyRegisteredTextOps(doc: TextDoc, ops: TextOp[]): { doc: TextDoc; inverse: TextOp[] } {
  const result = getSurface("text").applyOps(doc.body, ops);
  return {
    doc: {
      ...doc,
      body: result.body,
      updatedAt: doc.updatedAt + 1,
    },
    inverse: result.inverse as TextOp[],
  };
}

function intentToOps(intent: TextIntent): TextOp[] {
  return [{ op: "insertMarkdown", index: 0, markdown: intent.markdown }];
}

class HeadlessTextAdapter
  implements EditorAdapter<TextDoc, TextOp, TextSelection>, AdapterDriver<TextDoc, TextIntent>
{
  private engineDoc: TextDoc | null = null;
  private selection: TextSelection | null = null;
  private callback: ((ops: TextOp[]) => void) | null = null;
  private lastPushed = "";
  private ephemeral: TextEphemeral = { ...EMPTY_EPHEMERAL };

  mount(doc: TextDoc): void {
    this.engineDoc = clone(doc);
    this.lastPushed = fingerprint(this.engineDoc);
    this.selection = { blockIndex: 0 };
    this.ephemeral = { ...EMPTY_EPHEMERAL };
  }

  update(doc: TextDoc): void {
    const incoming = fingerprint(doc);
    if (incoming === this.lastPushed) return;
    this.engineDoc = clone(doc);
    this.lastPushed = incoming;
  }

  onUserEdit(callback: (ops: TextOp[]) => void): void {
    this.callback = callback;
  }

  readSelection(): TextSelection | null {
    return this.selection ? clone(this.selection) : null;
  }

  focusSelection(selection: TextSelection): void {
    this.selection = clone(selection);
  }

  dispose(): void {
    this.callback = null;
    this.engineDoc = null;
    this.selection = null;
    this.lastPushed = "";
    this.ephemeral = { ...EMPTY_EPHEMERAL };
  }

  simulateUserEdit(intent: TextIntent): void {
    if (!this.engineDoc) throw new Error("headless text adapter is not mounted");
    const ops = intentToOps(intent);
    const result = applyRegisteredTextOps(this.engineDoc, ops);
    this.engineDoc = result.doc;
    this.lastPushed = fingerprint(this.engineDoc);
    this.ephemeral = {
      cursorPx: this.ephemeral.cursorPx + 13,
      draft: `draft:${intent.type}`,
    };
    this.callback?.(ops);
  }

  readEngineDoc(): TextDoc {
    if (!this.engineDoc) throw new Error("headless text adapter is not mounted");
    return clone(this.engineDoc);
  }

  engineOwnsHistory(): boolean {
    return false;
  }

  readEngineEphemeral(): TextEphemeral {
    return { ...this.ephemeral };
  }
}

function createHeadlessTextAdapter(): TestAdapter<TextDoc, TextOp, TextSelection, TextIntent> {
  return new HeadlessTextAdapter();
}

function textFixture(): TextDoc {
  const doc = getSurface("text").createDoc("Adapter fixture");
  if (doc.kind !== "text") {
    throw new Error(`expected text document, got ${doc.kind}`);
  }
  return doc;
}

function textSpec(): ConformanceSpec<TextDoc, TextOp, TextSelection, TextIntent> {
  return {
    create: createHeadlessTextAdapter,
    applyOps: applyRegisteredTextOps,
    serializeDoc: serializeTextDoc,
    serializeSelection: serializeTextSelection,
    initialDoc: textFixture(),
    userEdit: { intent: { type: "insertMarkdown", markdown: "hello" } },
    gardenOps: [{ op: "replaceDoc", markdown: "From Garden" }],
    selection: { blockIndex: 0 },
    pendingAiOps: [{ op: "insertMarkdown", index: 0, markdown: "from AI" }],
  };
}

describe("registered text surface through the adapter harness", () => {
  it("is discoverable from the same package as the harness", () => {
    const def = getSurface("text");
    expect(def.kind).toBe("text");
    expect(def.createAdapter).toBeUndefined();
    expect(def.adapter.status).toBe("planned");
  });

  runAdapterConformance(textSpec(), it);
});
