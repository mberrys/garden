import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrateDoc } from "./migrations";
import { DOC_KINDS, SCHEMA_VERSION, SLIDE_H, SLIDE_LAYOUTS, SLIDE_W } from "./schema";
import { createDoc, makeCanvasNode, makeSlide, makeSlideElement } from "./factories";
import { nid } from "./ids";

describe("migrations", () => {
  it("accepts a document written by this version", () => {
    for (const kind of DOC_KINDS) {
      const result = migrateDoc(JSON.parse(JSON.stringify(createDoc(kind))));
      expect(result.ok, `${kind}: ${result.error}`).toBe(true);
    }
  });

  it("covers every schema version below the current one", () => {
    // A gap here means documents from that version can never be opened again.
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      expect(MIGRATIONS[version], `no migration from schema v${version}`).toBeDefined();
    }
  });

  it("refuses a document from a newer build rather than mangling it", () => {
    const doc = { ...createDoc("text"), schemaVersion: SCHEMA_VERSION + 5 };
    const result = migrateDoc(doc);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer than this build/);
  });

  it("reports why an invalid document was rejected", () => {
    const result = migrateDoc({ id: "doc_1", kind: "canvas", title: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects non-objects without throwing", () => {
    for (const input of [null, undefined, 42, "a string", []]) {
      expect(migrateDoc(input).ok).toBe(false);
    }
  });
});

describe("ids", () => {
  it("are prefixed and collision-resistant enough for a document", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => nid("nd")));
    expect(ids.size).toBe(5000);
    expect([...ids][0]).toMatch(/^nd_[0-9a-z]{8}$/);
  });
});

describe("factories", () => {
  it("creates a valid document of each kind", () => {
    for (const kind of DOC_KINDS) {
      const doc = createDoc(kind, "Titled");
      expect(doc.kind).toBe(kind);
      expect(doc.title).toBe("Titled");
      expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });

  it("lays every slide layout out inside the stage", () => {
    for (const layout of SLIDE_LAYOUTS) {
      const slide = makeSlide(layout, {
        title: "Title",
        subtitle: "Subtitle",
        body: "Body",
        bullets: ["one", "two"],
        left: ["a"],
        right: ["b"],
      });
      for (const element of slide.elements) {
        expect(element.x, `${layout} overflows left`).toBeGreaterThanOrEqual(0);
        expect(element.y, `${layout} overflows top`).toBeGreaterThanOrEqual(0);
        expect(element.x + element.w, `${layout} overflows right`).toBeLessThanOrEqual(SLIDE_W);
        expect(element.y + element.h, `${layout} overflows bottom`).toBeLessThanOrEqual(SLIDE_H);
      }
    }
  });

  it("fills node defaults from the schema and keeps a supplied id", () => {
    const node = makeCanvasNode({ kind: "rect", id: "nd_fixed", text: "Label" });
    expect(node.id).toBe("nd_fixed");
    expect(node).toMatchObject({ kind: "rect", opacity: 1, rotation: 0, locked: false });
    expect(node.kind === "rect" && node.w).toBeGreaterThan(0);
  });

  it("throws on a node spec that cannot be made valid", () => {
    expect(() => makeCanvasNode({ kind: "rect", w: "wide" as unknown as number })).toThrow();
  });

  it("fills slide element defaults", () => {
    const element = makeSlideElement({ type: "bullets", items: ["a", "b"] });
    expect(element.type).toBe("bullets");
    expect(element.id).toMatch(/^el_/);
    expect(element.w).toBeGreaterThan(0);
  });
});
