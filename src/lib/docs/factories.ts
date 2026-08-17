import {
  type CanvasDoc,
  type CanvasNode,
  type DatabaseDoc,
  type DeckDoc,
  type Doc,
  type DocKind,
  type PdfDoc,
  type Slide,
  type SlideElement,
  type SlideLayout,
  type TextDoc,
  CanvasNodeSchema,
  SlideElementSchema,
  SCHEMA_VERSION,
  SLIDE_H,
  SLIDE_W,
} from "./schema";
import {
  newDocId,
  newElementId,
  newFieldId,
  newNodeId,
  newRowId,
  newSlideId,
  newViewId,
} from "./ids";
import { markdownToDoc } from "@/lib/text/markdown";

function envelope(kind: DocKind, title: string) {
  const now = Date.now();
  return {
    id: newDocId(),
    kind,
    title,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function emptyTextBody(text = "") {
  return markdownToDoc(text);
}

export function createTextDoc(title = "Untitled document", text = ""): TextDoc {
  return { ...envelope("text", title), kind: "text", body: emptyTextBody(text) };
}

export function createCanvasDoc(title = "Untitled canvas"): CanvasDoc {
  return {
    ...envelope("canvas", title),
    kind: "canvas",
    body: { nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, background: "grid" },
  };
}

export function createDeckDoc(title = "Untitled deck"): DeckDoc {
  return {
    ...envelope("deck", title),
    kind: "deck",
    body: {
      slides: [makeSlide("title", { title, subtitle: "" })],
      theme: {
        background: "#ffffff",
        text: "#16181d",
        accent: "#4f46e5",
        muted: "#61666e",
      },
    },
  };
}

export function createPdfDoc(title = "Untitled PDF"): PdfDoc {
  return {
    ...envelope("pdf", title),
    kind: "pdf",
    body: {
      blobId: null,
      fileName: "",
      pageCount: 0,
      annotations: [],
      pageText: {},
    },
  };
}

export function createDatabaseDoc(title = "Untitled database"): DatabaseDoc {
  const viewId = newViewId();
  return {
    ...envelope("database", title),
    kind: "database",
    body: {
      fields: [
        { id: newFieldId(), name: "Name", type: "text" },
      ],
      rows: [],
      views: [
        {
          id: viewId,
          name: "Grid",
          type: "grid",
          hiddenFieldIds: [],
          sortFieldId: null,
          sortDirection: "asc",
        },
      ],
      activeViewId: viewId,
    },
  };
}

export function createDoc(kind: DocKind, title?: string): Doc {
  switch (kind) {
    case "text":
      return createTextDoc(title);
    case "canvas":
      return createCanvasDoc(title);
    case "deck":
      return createDeckDoc(title);
    case "pdf":
      return createPdfDoc(title);
    case "database":
      return createDatabaseDoc(title);
  }
}

/* ------------------------------------------------------------------ *
 * Slide construction
 * ------------------------------------------------------------------ */

const M = 88; // slide margin

export interface SlideSeed {
  title?: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  notes?: string;
}

function textEl(
  partial: Partial<SlideElement> & { text: string; x: number; y: number; w: number; h: number },
): SlideElement {
  return {
    id: newElementId(),
    type: "text",
    rotation: 0,
    opacity: 1,
    fontSize: 28,
    weight: "normal",
    align: "left",
    valign: "top",
    color: "#16181d",
    ...partial,
  } as SlideElement;
}

function bulletsEl(
  partial: { items: string[]; x: number; y: number; w: number; h: number; fontSize?: number },
): SlideElement {
  return {
    id: newElementId(),
    type: "bullets",
    rotation: 0,
    opacity: 1,
    fontSize: 24,
    color: "#16181d",
    marker: "disc",
    ...partial,
  } as SlideElement;
}

/**
 * Builds a slide from a layout name plus loose content. This is the single
 * place slide geometry is decided, so AI-generated slides (which supply only
 * text) land with exactly the same proportions as hand-made ones.
 */
export function makeSlide(layout: SlideLayout, seed: SlideSeed = {}): Slide {
  const elements: SlideElement[] = [];
  const contentW = SLIDE_W - M * 2;

  switch (layout) {
    case "title":
      elements.push(
        textEl({
          text: seed.title ?? "Title",
          x: M,
          y: 260,
          w: contentW,
          h: 110,
          fontSize: 68,
          weight: "bold",
          align: "center",
        }),
        textEl({
          text: seed.subtitle ?? "",
          x: M,
          y: 380,
          w: contentW,
          h: 60,
          fontSize: 26,
          align: "center",
          color: "#61666e",
        }),
      );
      break;

    case "section":
      elements.push(
        textEl({
          text: seed.title ?? "Section",
          x: M,
          y: 300,
          w: contentW,
          h: 90,
          fontSize: 52,
          weight: "semibold",
        }),
        textEl({
          text: seed.subtitle ?? "",
          x: M,
          y: 396,
          w: contentW,
          h: 50,
          fontSize: 22,
          color: "#61666e",
        }),
      );
      break;

    case "title-body":
      elements.push(
        textEl({
          text: seed.title ?? "Title",
          x: M,
          y: 96,
          w: contentW,
          h: 80,
          fontSize: 44,
          weight: "bold",
        }),
        textEl({
          text: seed.body ?? "",
          x: M,
          y: 208,
          w: contentW,
          h: SLIDE_H - 208 - M,
          fontSize: 24,
        }),
      );
      break;

    case "bullets":
      elements.push(
        textEl({
          text: seed.title ?? "Title",
          x: M,
          y: 96,
          w: contentW,
          h: 80,
          fontSize: 44,
          weight: "bold",
        }),
        bulletsEl({
          items: seed.bullets ?? [],
          x: M,
          y: 208,
          w: contentW,
          h: SLIDE_H - 208 - M,
        }),
      );
      break;

    case "two-column": {
      const colW = (contentW - 48) / 2;
      elements.push(
        textEl({
          text: seed.title ?? "Title",
          x: M,
          y: 96,
          w: contentW,
          h: 80,
          fontSize: 44,
          weight: "bold",
        }),
        bulletsEl({
          items: seed.left ?? [],
          x: M,
          y: 208,
          w: colW,
          h: SLIDE_H - 208 - M,
          fontSize: 22,
        }),
        bulletsEl({
          items: seed.right ?? [],
          x: M + colW + 48,
          y: 208,
          w: colW,
          h: SLIDE_H - 208 - M,
          fontSize: 22,
        }),
      );
      break;
    }

    case "image":
      elements.push(
        textEl({
          text: seed.title ?? "Title",
          x: M,
          y: 96,
          w: contentW,
          h: 70,
          fontSize: 40,
          weight: "bold",
        }),
        {
          id: newElementId(),
          type: "image",
          x: M,
          y: 190,
          w: contentW,
          h: SLIDE_H - 190 - M,
          rotation: 0,
          opacity: 1,
          blobId: null,
          alt: seed.body ?? "Image",
          fit: "contain",
        } as SlideElement,
      );
      break;

    case "blank":
      break;
  }

  return {
    id: newSlideId(),
    layout,
    background: null,
    elements,
    notes: seed.notes ?? "",
  };
}

/* ------------------------------------------------------------------ *
 * Canvas node construction
 * ------------------------------------------------------------------ */

/**
 * Geometry a node kind needs but that a caller (especially a language model)
 * routinely omits. Everything else is defaulted by the Zod schema itself, so
 * this table is the *only* extra knowledge in the system about node shape.
 */
const NODE_GEOMETRY: Record<CanvasNode["kind"], Record<string, unknown>> = {
  rect: { x: 0, y: 0, w: 160, h: 96 },
  ellipse: { x: 0, y: 0, w: 140, h: 100 },
  diamond: { x: 0, y: 0, w: 160, h: 110 },
  text: { x: 0, y: 0, w: 240, h: 40 },
  frame: { x: 0, y: 0, w: 480, h: 320 },
  line: { points: [0, 0, 140, 0] },
  ink: { points: [0, 0, 0.5] },
  connector: { from: {}, to: {} },
};

/**
 * Builds a fully-populated canvas node from a partial spec, filling defaults
 * through the Zod schema. Drawing tools and AI ops both go through here, so a
 * model-authored rectangle is indistinguishable from a hand-drawn one.
 *
 * Throws if the spec cannot be coerced into a valid node — callers in the AI
 * path catch this and surface it as a rejected suggestion.
 */
export function makeCanvasNode(
  spec: { kind: CanvasNode["kind"] } & Record<string, unknown>,
): CanvasNode {
  const defined: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) {
    if (v !== undefined && v !== null) defined[k] = v;
    else if (v === null && (k === "fill" || k === "nodeId")) defined[k] = null;
  }
  return CanvasNodeSchema.parse({
    id: newNodeId(),
    ...NODE_GEOMETRY[spec.kind],
    ...defined,
  });
}

/**
 * Same contract as `makeCanvasNode`, for slide elements.
 */
const ELEMENT_GEOMETRY: Record<SlideElement["type"], Record<string, unknown>> = {
  text: { x: M, y: 300, w: SLIDE_W - M * 2, h: 80 },
  bullets: { x: M, y: 220, w: SLIDE_W - M * 2, h: 360 },
  shape: { x: M, y: 260, w: 400, h: 200 },
  image: { x: M, y: 200, w: SLIDE_W - M * 2, h: 400 },
};

export function makeSlideElement(
  spec: { type: SlideElement["type"] } & Record<string, unknown>,
): SlideElement {
  const defined: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) {
    if (v !== undefined) defined[k] = v;
  }
  return SlideElementSchema.parse({
    id: newElementId(),
    ...ELEMENT_GEOMETRY[spec.type],
    ...defined,
  });
}
