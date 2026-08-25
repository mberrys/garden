import { describe, expect, it } from "vitest";
import { createDatabaseDoc, createPdfDoc, createTextDoc } from "@/lib/docs/factories";
import {
  EvidenceRefSchema,
  ExternalRefSchema,
  GardenRefSchema,
  gardenRef,
  isGardenRef,
} from "./schema";
import { resolveGardenRef, upgradeLegacyGardenRef } from "./resolve";

describe("GardenRef", () => {
  it("parses the versioned shape", () => {
    const parsed = GardenRefSchema.parse({
      version: 1,
      documentId: "doc_a",
      objectId: "row_1",
      anchor: { kind: "text", start: 0, end: 4, snapshot: "hello" },
    });
    expect(parsed.version).toBe(1);
    expect(parsed.anchor?.kind).toBe("text");
  });

  it("lifts a pre-1.0 {documentId, objectId} cell", () => {
    const parsed = GardenRefSchema.parse({ documentId: "doc_a", objectId: "nd_1" });
    expect(parsed).toEqual({ version: 1, documentId: "doc_a", objectId: "nd_1" });
  });

  it("rejects a pointer with no document", () => {
    expect(GardenRefSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe("EvidenceRef / ExternalRef", () => {
  it("carries supports/contradicts/qualifies/contextualizes", () => {
    const parsed = EvidenceRefSchema.parse({
      id: "ev_1",
      source: gardenRef({ documentId: "doc_pdf", objectId: "an_1" }),
      relation: "supports",
      capturedBy: "human",
    });
    expect(parsed.relation).toBe("supports");
  });

  it("keeps provider freshness on external refs", () => {
    const parsed = ExternalRefSchema.parse({
      provider: "mlflow",
      externalId: "run-9",
      freshness: "stale",
      snapshotHash: "abc",
      snapshotProvenance: "imported 2026-08-18",
    });
    expect(parsed.freshness).toBe("stale");
  });
});

describe("resolveGardenRef", () => {
  it("marks missing documents broken rather than retargeting", () => {
    const text = createTextDoc("Notes");
    const resolved = resolveGardenRef(gardenRef({ documentId: "doc_missing" }), {
      [text.id]: text,
    });
    expect(resolved.status).toBe("broken");
    expect(resolved.label).toMatch(/Broken reference/);
    expect(resolved.doc).toBeUndefined();
  });

  it("resolves a live document", () => {
    const text = createTextDoc("Notes");
    const resolved = resolveGardenRef(gardenRef({ documentId: text.id }), {
      [text.id]: text,
    });
    expect(resolved.status).toBe("ok");
    expect(resolved.label).toBe("Notes");
  });

  it("marks a missing object unavailable without pointing at another row", () => {
    const db = createDatabaseDoc("Sources");
    const resolved = resolveGardenRef(
      gardenRef({ documentId: db.id, objectId: "row_gone" }),
      { [db.id]: db },
    );
    expect(resolved.status).toBe("unavailable");
    expect(resolved.doc?.id).toBe(db.id);
  });
});

describe("upgradeLegacyGardenRef", () => {
  it("is a no-op on already-versioned refs", () => {
    const current = { version: 1, documentId: "doc_a" };
    expect(upgradeLegacyGardenRef(current)).toEqual(current);
  });

  it("adds version: 1 to a legacy cell", () => {
    expect(upgradeLegacyGardenRef({ documentId: "doc_a", objectId: "x" })).toEqual({
      version: 1,
      documentId: "doc_a",
      objectId: "x",
    });
  });

  it("type-guards GardenRef values", () => {
    expect(isGardenRef({ version: 1, documentId: "doc_a" })).toBe(true);
    expect(isGardenRef("doc_a")).toBe(false);
  });

  it("can point at a PDF page region", () => {
    const pdf = createPdfDoc("Paper");
    const ref = gardenRef({
      documentId: pdf.id,
      anchor: { kind: "pdf-text", page: 1, start: 0, end: 12, snapshot: "Quarterly" },
    });
    expect(resolveGardenRef(ref, { [pdf.id]: pdf }).status).toBe("ok");
  });
});
