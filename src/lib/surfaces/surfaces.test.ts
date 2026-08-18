import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Box } from "lucide-react";
import {
  allKinds,
  allSurfaces,
  getSurface,
  registerSurface,
  unregisterSurface,
} from "@/lib/surfaces";
import { DOC_KINDS, DocSchema, SCHEMA_VERSION, type Doc, type DocKind } from "@/lib/docs/schema";
import { opReference, opReferenceFromSchema } from "@/lib/ai/op-reference";
import { newDocId } from "@/lib/docs/ids";

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
      expect(def.bodySchema).toBeDefined();
      expect(def.opSchema).toBeDefined();
    }
  });

  it("registers a stub surface, generates op reference, and round-trips ops", () => {
    const StubBodySchema = z.object({ value: z.string() });
    const StubOpSchema = z.discriminatedUnion("op", [
      z
        .object({
          op: z.literal("setValue"),
          value: z.string(),
        })
        .describe("Replace the stub value"),
    ]);

    const now = Date.now();
    const stubDoc = {
      id: newDocId(),
      kind: "stub",
      title: "Stub",
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION,
      body: { value: "initial" },
    };

    registerSurface({
      kind: "stub",
      label: "Stub",
      icon: Box,
      iconColor: "#64748b",
      bodySchema: StubBodySchema,
      opSchema: StubOpSchema,
      applyOps: (body, ops) => {
        let value = body.value;
        const inverse: { op: "setValue"; value: string }[] = [];
        for (const op of ops) {
          if (op.op === "setValue") {
            inverse.push({ op: "setValue", value });
            value = op.value;
          }
        }
        return { body: { value }, inverse };
      },
      createDoc: (title = "Untitled stub") =>
        ({
          ...stubDoc,
          id: newDocId(),
          title,
          body: { value: "" },
        }) as unknown as Doc,
      ownsHistory: false,
      contextBudget: 1_000,
      promptNotes: "Stub surface for tests.",
      serializeDoc: (doc) => doc.body.value || "(empty)",
      describeSelection: () => null,
      mockReply: () => "Stub mock.",
      describeOp: (op) => (op.op === "setValue" ? `Set value to "${op.value}"` : undefined),
      referencedBlobIds: () => new Set(),
      remapBlobIds: (doc) => doc,
      loadComponent: async () => ({ default: () => null }),
    });

    expect(allSurfaces().some((s) => s.kind === "stub")).toBe(true);

    const ref = opReferenceFromSchema(getSurface("stub" as DocKind).opSchema);
    expect(ref).toMatch(/setValue/);

    const def = allSurfaces().find((s) => s.kind === "stub")!;
    const body = { value: "hello" };
    const { body: next, inverse } = def.applyOps(body, [{ op: "setValue", value: "world" }]);
    expect(next.value).toBe("world");
    const restored = def.applyOps(next, inverse);
    expect(restored.body.value).toBe("hello");

    unregisterSurface("stub");
    expect(() => getSurface("stub" as DocKind)).toThrow(/unknown surface kind/i);
  });
});
