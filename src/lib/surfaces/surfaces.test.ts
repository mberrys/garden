import { describe, expect, it } from "vitest";
import { allKinds, allSurfaces, getSurface } from ".";
import { DOC_KINDS, DocSchema, type DocKind } from "@/lib/docs/schema";
import { opReference } from "@/lib/ai/op-reference";

describe("surface registry", () => {
  it("discovers all four built-in surfaces", () => {
    const kinds = new Set(allKinds());
    for (const k of DOC_KINDS) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(kinds.size).toBe(DOC_KINDS.length);
  });

  it("getSurface returns a definition for each kind", () => {
    for (const kind of DOC_KINDS) {
      const def = getSurface(kind);
      expect(def.kind).toBe(kind);
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
    }
  });

  it("getSurface throws for an unknown kind", () => {
    expect(() => getSurface("spreadsheet" as DocKind)).toThrow(/unknown surface kind/i);
  });

  it("createDoc produces a valid Doc for every surface", () => {
    for (const def of allSurfaces()) {
      const doc = def.createDoc("Test title");
      expect(doc.kind).toBe(def.kind);
      const parsed = DocSchema.safeParse(doc);
      expect(parsed.success).toBe(true);
    }
  });

  it("describeOp returns a string for its own ops and undefined for foreign ones", () => {
    const textDef = getSurface("text");
    expect(typeof textDef.describeOp({ op: "insertMarkdown", index: 0, markdown: "hi" })).toBe(
      "string",
    );
    expect(textDef.describeOp({ op: "addNode", node: { kind: "rect" } })).toBeUndefined();

    const canvasDef = getSurface("canvas");
    expect(typeof canvasDef.describeOp({ op: "addNode", node: { kind: "rect" } })).toBe("string");
    expect(canvasDef.describeOp({ op: "insertMarkdown", index: 0, markdown: "hi" })).toBeUndefined();
  });

  it("op reference generation works via the registry opSchema", () => {
    for (const kind of DOC_KINDS) {
      const ref = opReference(kind);
      expect(typeof ref).toBe("string");
      expect(ref.length).toBeGreaterThan(0);
    }
  });

  it("allSurfaces returns definitions with required fields", () => {
    for (const def of allSurfaces()) {
      expect(def.icon).toBeDefined();
      expect(typeof def.iconColor).toBe("string");
      expect(typeof def.contextBudget).toBe("number");
      expect(typeof def.promptNotes).toBe("string");
      expect(typeof def.ownsHistory).toBe("boolean");
      expect(typeof def.serializeDoc).toBe("function");
      expect(typeof def.describeSelection).toBe("function");
      expect(typeof def.mockReply).toBe("function");
      expect(typeof def.referencedBlobIds).toBe("function");
      expect(typeof def.remapBlobIds).toBe("function");
      expect(typeof def.loadComponent).toBe("function");
    }
  });

  it("describes every built-in against the adapter contract", () => {
    const kinds = new Set(allKinds());
    expect([...kinds].sort()).toEqual([...DOC_KINDS].sort());
    for (const def of allSurfaces()) {
      expect(def.ownsHistory).toBe(false);
      expect(def.adapter.engine === "garden" || def.adapter.engine === "borrowed").toBe(true);
      expect(def.adapter.status === "planned" || def.adapter.status === "not-required").toBe(true);
      expect(def.adapter.userEdits.length).toBeGreaterThan(0);
      expect(def.adapter.gardenUpdates.length).toBeGreaterThan(0);
      expect(def.adapter.selection.length).toBeGreaterThan(0);
      expect(def.adapter.notes.length).toBeGreaterThan(0);
      expect(def.createAdapter).toBeUndefined();
    }
    expect(getSurface("text").adapter.status).toBe("planned");
    expect(getSurface("pdf").adapter.engine).toBe("borrowed");
    expect(getSurface("pdf").adapter.status).toBe("planned");
    expect(getSurface("canvas").adapter.status).toBe("not-required");
    expect(getSurface("deck").adapter.status).toBe("not-required");
    expect((allKinds() as string[]).includes("stub")).toBe(false);
  });
});
