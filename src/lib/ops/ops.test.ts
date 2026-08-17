import { describe, expect, it } from "vitest";
import { applyOps, parseOps, describeOperation, OpError, type AnyOp } from ".";
import {
  createCanvasDoc,
  createDatabaseDoc,
  createDeckDoc,
  createPdfDoc,
  createTextDoc,
} from "@/lib/docs/factories";
import type {
  CanvasDoc,
  DatabaseDoc,
  DeckDoc,
  Doc,
  DocKind,
  PdfDoc,
  TextDoc,
} from "@/lib/docs/schema";
import type { OpOf } from ".";

/**
 * The load-bearing property of the whole app: applying a batch and then its
 * inverse must return the document exactly as it was. Undo, redo and AI reject
 * all depend on it, for every op in every surface.
 */
function expectRoundTrip<K extends DocKind>(doc: Extract<Doc, { kind: K }>, ops: OpOf<K>[]) {
  const forward = applyOps(doc, ops);
  const back = applyOps(forward.doc, forward.inverse);
  expect(stripTimestamps(back.doc)).toEqual(stripTimestamps(doc));
  return forward;
}

function stripTimestamps(doc: Doc): unknown {
  return { ...doc, updatedAt: 0, createdAt: 0 };
}

describe("canvas ops", () => {
  it("adds a node and inverts to a delete", () => {
    const doc = createCanvasDoc();
    const result = expectRoundTrip<"canvas">(doc, [
      { op: "addNode", node: { kind: "rect", x: 10, y: 20, w: 100, h: 50, text: "Hello" } },
    ]);
    expect(result.doc.body.nodes).toHaveLength(1);
    expect(result.doc.body.nodes[0].kind).toBe("rect");
  });

  it("fills defaults from the schema for a sparse node spec", () => {
    const doc = createCanvasDoc();
    const { doc: next } = applyOps<"canvas">(doc, [{ op: "addNode", node: { kind: "ellipse" } }]);
    const node = next.body.nodes[0];
    expect(node).toMatchObject({ kind: "ellipse", opacity: 1, rotation: 0, locked: false });
    expect(node.id).toMatch(/^nd_/);
  });

  it("round-trips update, reorder, delete and background", () => {
    let doc: CanvasDoc = createCanvasDoc();
    doc = applyOps<"canvas">(doc, [
      { op: "addNode", node: { kind: "rect", id: "nd_a", x: 0, y: 0, w: 10, h: 10 } },
      { op: "addNode", node: { kind: "ellipse", id: "nd_b", x: 50, y: 0, w: 10, h: 10 } },
    ]).doc;

    expectRoundTrip<"canvas">(doc, [{ op: "updateNode", id: "nd_a", patch: { x: 999, fill: "#ff0000" } }]);
    expectRoundTrip<"canvas">(doc, [{ op: "reorderNode", id: "nd_a", toIndex: 1 }]);
    expectRoundTrip<"canvas">(doc, [{ op: "deleteNode", id: "nd_b" }]);
    expectRoundTrip<"canvas">(doc, [{ op: "setBackground", background: "dots" }]);
  });

  it("detaches connectors when their bound node is deleted, and restores on undo", () => {
    let doc: CanvasDoc = createCanvasDoc();
    doc = applyOps<"canvas">(doc, [
      { op: "addNode", node: { kind: "rect", id: "nd_a", x: 0, y: 0, w: 10, h: 10 } },
      { op: "addNode", node: { kind: "rect", id: "nd_b", x: 200, y: 0, w: 10, h: 10 } },
      {
        op: "addNode",
        node: { kind: "connector", id: "nd_c", from: { nodeId: "nd_a" }, to: { nodeId: "nd_b" } },
      },
    ]).doc;

    const forward = expectRoundTrip<"canvas">(doc, [{ op: "deleteNode", id: "nd_a" }]);
    const connector = forward.doc.body.nodes.find((n) => n.id === "nd_c");
    expect(connector?.kind).toBe("connector");
    if (connector?.kind === "connector") {
      expect(connector.from.nodeId).toBeNull();
      expect(connector.to.nodeId).toBe("nd_b");
    }
  });

  it("rejects a patch that would change a node's kind", () => {
    const doc = applyOps<"canvas">(createCanvasDoc(), [
      { op: "addNode", node: { kind: "rect", id: "nd_a" } },
    ]).doc;
    expect(() =>
      applyOps<"canvas">(doc, [{ op: "updateNode", id: "nd_a", patch: { kind: "ellipse" } }]),
    ).toThrow(OpError);
  });

  it("rejects an update to a missing node without mutating the document", () => {
    const doc = createCanvasDoc();
    const before = JSON.parse(JSON.stringify(doc));
    expect(() => applyOps<"canvas">(doc, [{ op: "updateNode", id: "nope", patch: { x: 1 } }])).toThrow(
      /no node with id/,
    );
    expect(doc).toEqual(before);
  });

  it("rejects an out-of-range property value", () => {
    const doc = applyOps<"canvas">(createCanvasDoc(), [
      { op: "addNode", node: { kind: "rect", id: "nd_a" } },
    ]).doc;
    expect(() =>
      applyOps<"canvas">(doc, [{ op: "updateNode", id: "nd_a", patch: { opacity: 42 } }]),
    ).toThrow(OpError);
  });
});

describe("deck ops", () => {
  it("adds a content-shaped slide with derived geometry", () => {
    const doc = createDeckDoc("Deck");
    const { doc: next } = applyOps<"deck">(doc, [
      { op: "addSlide", layout: "bullets", title: "Findings", bullets: ["one", "two"] },
    ]);
    expect(next.body.slides).toHaveLength(2);
    const slide = next.body.slides[1];
    expect(slide.layout).toBe("bullets");
    const bullets = slide.elements.find((e) => e.type === "bullets");
    expect(bullets).toBeDefined();
    if (bullets?.type === "bullets") expect(bullets.items).toEqual(["one", "two"]);
    // Everything must sit inside the 1280x720 stage.
    for (const el of slide.elements) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(1280);
      expect(el.y + el.h).toBeLessThanOrEqual(720);
    }
  });

  it("round-trips slide add, move, delete and note edits", () => {
    let doc: DeckDoc = createDeckDoc("Deck");
    doc = applyOps<"deck">(doc, [
      { op: "addSlide", layout: "bullets", title: "A", bullets: ["x"] },
      { op: "addSlide", layout: "title-body", title: "B", body: "text" },
    ]).doc;
    const ids = doc.body.slides.map((s) => s.id);

    expectRoundTrip<"deck">(doc, [{ op: "moveSlide", id: ids[2], toIndex: 0 }]);
    expectRoundTrip<"deck">(doc, [{ op: "deleteSlide", id: ids[1] }]);
    expectRoundTrip<"deck">(doc, [{ op: "setSlide", id: ids[0], patch: { notes: "say hello" } }]);
    expectRoundTrip<"deck">(doc, [{ op: "setTheme", patch: { accent: "#ff0000" } }]);
  });

  it("rejects a theme patch with invalid colour values", () => {
    const doc = createDeckDoc("Deck");
    expect(() => applyOps<"deck">(doc, [{ op: "setTheme", patch: { accent: 12345 } }])).toThrow(
      /setTheme/,
    );
  });

  it("restores a deleted slide verbatim, ids included", () => {
    let doc: DeckDoc = createDeckDoc("Deck");
    doc = applyOps<"deck">(doc, [
      { op: "addSlide", layout: "bullets", title: "A", bullets: ["x", "y"] },
    ]).doc;
    const victim = doc.body.slides[1];

    const forward = applyOps<"deck">(doc, [{ op: "deleteSlide", id: victim.id }]);
    expect(forward.doc.body.slides).toHaveLength(1);
    const restored = applyOps<"deck">(forward.doc, forward.inverse);
    expect(restored.doc.body.slides[1]).toEqual(victim);
  });

  it("round-trips element add, update, delete and reorder", () => {
    let doc: DeckDoc = createDeckDoc("Deck");
    const slideId = doc.body.slides[0].id;
    doc = applyOps<"deck">(doc, [
      { op: "addElement", slideId, element: { type: "shape", shape: "rect", fill: "#123456" } },
    ]).doc;
    const elementId = doc.body.slides[0].elements.at(-1)!.id;

    expectRoundTrip<"deck">(doc, [
      { op: "updateElement", slideId, id: elementId, patch: { x: 40, w: 200 } },
    ]);
    expectRoundTrip<"deck">(doc, [{ op: "deleteElement", slideId, id: elementId }]);
    expectRoundTrip<"deck">(doc, [{ op: "reorderElement", slideId, id: elementId, toIndex: 0 }]);
  });
});

describe("pdf ops", () => {
  const withSource = (): PdfDoc =>
    applyOps<"pdf">(createPdfDoc("Paper"), [
      { op: "setSource", blobId: "blob_1", fileName: "paper.pdf", pageCount: 12 },
    ]).doc;

  it("round-trips annotations", () => {
    const doc = withSource();
    const forward = expectRoundTrip<"pdf">(doc, [
      {
        op: "addAnnotation",
        page: 3,
        type: "highlight",
        rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 },
        quote: "a claim worth checking",
      },
    ]);
    expect(forward.doc.body.annotations).toHaveLength(1);
    expect(forward.doc.body.annotations[0].color).toBe("#fbbf24");
  });

  it("round-trips annotation updates and deletes", () => {
    let doc: PdfDoc = withSource();
    doc = applyOps<"pdf">(doc, [
      { op: "addAnnotation", id: "an_1", page: 1, type: "box", rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    ]).doc;
    expectRoundTrip<"pdf">(doc, [{ op: "updateAnnotation", id: "an_1", patch: { note: "check this" } }]);
    expectRoundTrip<"pdf">(doc, [{ op: "deleteAnnotation", id: "an_1" }]);
  });

  it("treats re-extracting identical page text as a no-op", () => {
    let doc: PdfDoc = withSource();
    doc = applyOps<"pdf">(doc, [{ op: "setPageText", page: 1, text: "hello" }]).doc;
    const again = applyOps<"pdf">(doc, [{ op: "setPageText", page: 1, text: "hello" }]);
    expect(again.inverse).toHaveLength(0);
  });

  it("rejects annotation rects outside the normalised page bounds", () => {
    const doc = withSource();
    expect(() =>
      applyOps<"pdf">(doc, [
        { op: "addAnnotation", page: 1, type: "highlight", rect: { x: -1, y: 0, w: 0.5, h: 0.1 } },
      ]),
    ).toThrow(/addAnnotation/);
  });
});

describe("text ops", () => {
  it("replaces the document from markdown and inverts exactly", () => {
    const doc = createTextDoc("Doc", "original paragraph");
    const forward = expectRoundTrip<"text">(doc, [
      { op: "replaceDoc", markdown: "# Title\n\nA new paragraph with **bold**." },
    ]);
    expect(forward.doc.body.content).toHaveLength(2);
    expect(forward.doc.body.content![0].type).toBe("heading");
  });

  it("round-trips insert, replace and delete of blocks", () => {
    let doc: TextDoc = createTextDoc("Doc");
    doc = applyOps<"text">(doc, [
      { op: "replaceDoc", markdown: "# One\n\nTwo\n\nThree\n\nFour" },
    ]).doc;

    expectRoundTrip<"text">(doc, [{ op: "insertMarkdown", index: 1, markdown: "Inserted" }]);
    expectRoundTrip<"text">(doc, [{ op: "replaceMarkdown", index: 1, count: 2, markdown: "- a\n- b" }]);
    expectRoundTrip<"text">(doc, [{ op: "deleteBlocks", index: 0, count: 2 }]);
  });

  it("keeps a paragraph when every block is deleted, and still undoes cleanly", () => {
    const doc = applyOps<"text">(createTextDoc("Doc"), [
      { op: "replaceDoc", markdown: "One\n\nTwo" },
    ]).doc;

    const forward = applyOps<"text">(doc, [{ op: "deleteBlocks", index: 0, count: 2 }]);
    expect(forward.doc.body.content).toEqual([{ type: "paragraph" }]);

    const back = applyOps<"text">(forward.doc, forward.inverse);
    expect(back.doc.body.content).toEqual(doc.body.content);
  });

  it("rejects a range past the end of the document", () => {
    const doc = createTextDoc("Doc");
    expect(() => applyOps<"text">(doc, [{ op: "deleteBlocks", index: 5, count: 1 }])).toThrow(
      /past the end|exceeds the document/,
    );
  });
});

describe("database ops", () => {
  it("round-trips row and cell edits", () => {
    const doc = createDatabaseDoc("Test");
    const fieldId = doc.body.fields[0].id;
    const forward = expectRoundTrip<"database">(doc, [
      { op: "addRow", row: { cells: { [fieldId]: "Alpha" } } },
    ]);
    const rowId = forward.doc.body.rows[0].id;
    expectRoundTrip<"database">(forward.doc, [
      { op: "setCell", rowId, fieldId, value: "Beta" },
    ]);
  });

  it("round-trips relation link and unlink", () => {
    const target = createDatabaseDoc("Target");
    let doc: DatabaseDoc = createDatabaseDoc("Source");
    doc = applyOps<"database">(doc, [
      {
        op: "addField",
        field: { type: "relation", name: "Link", targetDocId: target.id },
      },
    ]).doc;
    const relationField = doc.body.fields.find((f) => f.type === "relation");
    expect(relationField).toBeDefined();

    target.body.rows.push({ id: "row_tgt", cells: {} });
    doc = applyOps<"database">(doc, [{ op: "addRow", row: { id: "row_src", cells: {} } }]).doc;

    expectRoundTrip<"database">(doc, [
      {
        op: "linkRelation",
        rowId: "row_src",
        fieldId: relationField!.id,
        targetRowIds: ["row_tgt"],
      },
    ]);
    expectRoundTrip<"database">(doc, [
      {
        op: "unlinkRelation",
        rowId: "row_src",
        fieldId: relationField!.id,
        targetRowIds: ["row_tgt"],
      },
    ]);
  });
});

describe("parseOps", () => {
  it("accepts a well-formed model batch", () => {
    const result = parseOps("canvas", [
      { op: "addNode", node: { kind: "rect", x: 0, y: 0, w: 10, h: 10 } },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects the whole batch when any operation is invalid", () => {
    const result = parseOps("canvas", [
      { op: "addNode", node: { kind: "rect" } },
      { op: "addNode", node: { kind: "banana" } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("operation 1");
    }
  });

  it("rejects a non-array payload", () => {
    const result = parseOps("deck", { op: "addSlide" });
    expect(result.ok).toBe(false);
  });

  it("rejects ops belonging to a different surface", () => {
    const result = parseOps("deck", [{ op: "addNode", node: { kind: "rect" } }]);
    expect(result.ok).toBe(false);
  });
});

describe("describeOperation", () => {
  it("produces a readable line for every operation kind", () => {
    const samples: AnyOp[] = [
      { op: "replaceDoc", markdown: "hello world" },
      { op: "insertMarkdown", index: 0, markdown: "# Hi" },
      { op: "deleteBlocks", index: 0, count: 2 },
      { op: "addNode", node: { kind: "rect", text: "Box" } },
      { op: "deleteNode", id: "nd_a" },
      { op: "setBackground", background: "grid" },
      { op: "addSlide", layout: "title", title: "Intro" },
      { op: "moveSlide", id: "sl_a", toIndex: 2 },
      { op: "addAnnotation", page: 2, type: "highlight", rect: { x: 0, y: 0, w: 1, h: 1 } },
      { op: "setSource", blobId: null, fileName: "a.pdf", pageCount: 3 },
      { op: "addRow", row: { cells: { fld_a: "x" } } },
      { op: "setCell", rowId: "row_a", fieldId: "fld_a", value: "y" },
      { op: "setActiveView", id: "vw_a" },
    ];
    for (const op of samples) {
      const text = describeOperation(op);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("undefined");
    }
  });
});
