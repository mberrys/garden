import { z } from "zod";

/**
 * The document model for every surface in the suite.
 *
 * Zod schemas are the single source of truth: TypeScript types are derived with
 * `z.infer`, the persistence layer validates on read, and the AI layer converts
 * these same schemas to JSON Schema for tool definitions. One definition, three
 * consumers — so a model can never emit a shape the app does not understand.
 */

export const SCHEMA_VERSION = 1;

export const DOC_KINDS = ["text", "pdf", "deck", "canvas"] as const;
export const DocKindSchema = z.enum(DOC_KINDS);
export type DocKind = z.infer<typeof DocKindSchema>;

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  text: "Document",
  pdf: "PDF",
  deck: "Deck",
  canvas: "Canvas",
};

/* ------------------------------------------------------------------ *
 * Shared primitives
 * ------------------------------------------------------------------ */

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Rect = z.infer<typeof RectSchema>;

/** Hex colour, or one of the named palette slots resolved against the theme. */
export const ColorSchema = z.string().min(1).max(32);

export const PALETTE = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
] as const;

/* ------------------------------------------------------------------ *
 * Text documents — ProseMirror/TipTap JSON
 * ------------------------------------------------------------------ */

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

export const PmMarkSchema: z.ZodType<PmMark> = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

export const PmNodeSchema: z.ZodType<PmNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(PmNodeSchema).optional(),
    marks: z.array(PmMarkSchema).optional(),
    text: z.string().optional(),
  }),
);

/* ------------------------------------------------------------------ *
 * Canvas — our own scene graph
 * ------------------------------------------------------------------ */

export const StrokeStyleSchema = z.enum(["solid", "dashed", "dotted"]);
export type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

const shapeCommon = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  fill: ColorSchema.nullable().default(null),
  stroke: ColorSchema.default("#64748b"),
  strokeWidth: z.number().min(0).max(48).default(2),
  strokeStyle: StrokeStyleSchema.default("solid"),
  /** Optional label rendered centred inside the shape. */
  text: z.string().default(""),
  fontSize: z.number().min(6).max(200).default(14),
  textColor: ColorSchema.default("#16181d"),
};

export const RectNodeSchema = z.object({
  ...shapeCommon,
  kind: z.literal("rect"),
  radius: z.number().min(0).max(200).default(6),
});

export const EllipseNodeSchema = z.object({
  ...shapeCommon,
  kind: z.literal("ellipse"),
});

export const DiamondNodeSchema = z.object({
  ...shapeCommon,
  kind: z.literal("diamond"),
});

export const TextNodeSchema = z.object({
  id: z.string(),
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  text: z.string().default(""),
  fontSize: z.number().min(6).max(200).default(16),
  textColor: ColorSchema.default("#16181d"),
  align: z.enum(["left", "center", "right"]).default("left"),
  weight: z.enum(["normal", "bold"]).default("normal"),
});

/** A frame is a titled region; children are whatever overlaps it spatially. */
export const FrameNodeSchema = z.object({
  id: z.string(),
  kind: z.literal("frame"),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  name: z.string().default("Frame"),
  fill: ColorSchema.nullable().default(null),
  stroke: ColorSchema.default("#94a3b8"),
});

export const LineNodeSchema = z.object({
  id: z.string(),
  kind: z.literal("line"),
  /** Flat [x1,y1,x2,y2,...] in scene coordinates. At least two points. */
  points: z.array(z.number()).min(4),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  stroke: ColorSchema.default("#64748b"),
  strokeWidth: z.number().min(0).max(48).default(2),
  strokeStyle: StrokeStyleSchema.default("solid"),
  arrowStart: z.boolean().default(false),
  arrowEnd: z.boolean().default(false),
});

export const InkNodeSchema = z.object({
  id: z.string(),
  kind: z.literal("ink"),
  /** Flat [x,y,pressure, ...] triples in scene coordinates. */
  points: z.array(z.number()).min(3),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  stroke: ColorSchema.default("#16181d"),
  size: z.number().min(0.5).max(80).default(4),
  /** Highlighter strokes render multiplied and under everything else. */
  highlighter: z.boolean().default(false),
});

export const ANCHORS = ["top", "right", "bottom", "left", "auto"] as const;
export const AnchorSchema = z.enum(ANCHORS);
export type Anchor = z.infer<typeof AnchorSchema>;

export const ConnectorEndSchema = z.object({
  nodeId: z.string().nullable().default(null),
  anchor: AnchorSchema.default("auto"),
  /** Used when nodeId is null — a free-floating endpoint. */
  x: z.number().default(0),
  y: z.number().default(0),
});

export const ConnectorNodeSchema = z.object({
  id: z.string(),
  kind: z.literal("connector"),
  from: ConnectorEndSchema,
  to: ConnectorEndSchema,
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  stroke: ColorSchema.default("#64748b"),
  strokeWidth: z.number().min(0).max(48).default(2),
  strokeStyle: StrokeStyleSchema.default("solid"),
  arrowStart: z.boolean().default(false),
  arrowEnd: z.boolean().default(true),
  label: z.string().default(""),
  /** `elbow` routes with right angles, `straight` is a direct segment. */
  routing: z.enum(["elbow", "straight"]).default("elbow"),
});

export const CanvasNodeSchema = z.discriminatedUnion("kind", [
  RectNodeSchema,
  EllipseNodeSchema,
  DiamondNodeSchema,
  TextNodeSchema,
  FrameNodeSchema,
  LineNodeSchema,
  InkNodeSchema,
  ConnectorNodeSchema,
]);
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;
export type RectNode = z.infer<typeof RectNodeSchema>;
export type EllipseNode = z.infer<typeof EllipseNodeSchema>;
export type DiamondNode = z.infer<typeof DiamondNodeSchema>;
export type CanvasTextNode = z.infer<typeof TextNodeSchema>;
export type FrameNode = z.infer<typeof FrameNodeSchema>;
export type LineNode = z.infer<typeof LineNodeSchema>;
export type InkNode = z.infer<typeof InkNodeSchema>;
export type ConnectorNode = z.infer<typeof ConnectorNodeSchema>;
export type CanvasNodeKind = CanvasNode["kind"];

/** Node kinds that occupy an axis-aligned box (x/y/w/h). */
export type BoxNode = RectNode | EllipseNode | DiamondNode | CanvasTextNode | FrameNode;

export function isBoxNode(node: CanvasNode): node is BoxNode {
  return (
    node.kind === "rect" ||
    node.kind === "ellipse" ||
    node.kind === "diamond" ||
    node.kind === "text" ||
    node.kind === "frame"
  );
}

export const CanvasBodySchema = z.object({
  nodes: z.array(CanvasNodeSchema).default([]),
  /** Persisted so reopening a canvas restores the view the user left. */
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number() })
    .default({ x: 0, y: 0, zoom: 1 }),
  background: z.enum(["grid", "dots", "plain"]).default("grid"),
});
export type CanvasBody = z.infer<typeof CanvasBodySchema>;

/* ------------------------------------------------------------------ *
 * Deck — slides in a fixed 1280x720 coordinate space
 * ------------------------------------------------------------------ */

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

const elementCommon = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
};

export const SlideTextElementSchema = z.object({
  ...elementCommon,
  type: z.literal("text"),
  text: z.string().default(""),
  fontSize: z.number().min(8).max(200).default(28),
  weight: z.enum(["normal", "semibold", "bold"]).default("normal"),
  align: z.enum(["left", "center", "right"]).default("left"),
  valign: z.enum(["top", "middle", "bottom"]).default("top"),
  color: ColorSchema.default("#16181d"),
});

export const SlideBulletsElementSchema = z.object({
  ...elementCommon,
  type: z.literal("bullets"),
  items: z.array(z.string()).default([]),
  fontSize: z.number().min(8).max(120).default(24),
  color: ColorSchema.default("#16181d"),
  marker: z.enum(["disc", "dash", "number", "none"]).default("disc"),
});

export const SlideShapeElementSchema = z.object({
  ...elementCommon,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line"]).default("rect"),
  fill: ColorSchema.nullable().default("#4f46e5"),
  stroke: ColorSchema.nullable().default(null),
  strokeWidth: z.number().min(0).max(32).default(0),
  radius: z.number().min(0).max(200).default(8),
});

export const SlideImageElementSchema = z.object({
  ...elementCommon,
  type: z.literal("image"),
  blobId: z.string().nullable().default(null),
  /** Fallback caption shown when the blob is missing (e.g. after import). */
  alt: z.string().default(""),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

export const SlideElementSchema = z.discriminatedUnion("type", [
  SlideTextElementSchema,
  SlideBulletsElementSchema,
  SlideShapeElementSchema,
  SlideImageElementSchema,
]);
export type SlideElement = z.infer<typeof SlideElementSchema>;
export type SlideTextElement = z.infer<typeof SlideTextElementSchema>;
export type SlideBulletsElement = z.infer<typeof SlideBulletsElementSchema>;
export type SlideShapeElement = z.infer<typeof SlideShapeElementSchema>;
export type SlideImageElement = z.infer<typeof SlideImageElementSchema>;

export const SLIDE_LAYOUTS = [
  "title",
  "title-body",
  "bullets",
  "two-column",
  "section",
  "image",
  "blank",
] as const;
export const SlideLayoutSchema = z.enum(SLIDE_LAYOUTS);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const SlideSchema = z.object({
  id: z.string(),
  layout: SlideLayoutSchema.default("title-body"),
  background: ColorSchema.nullable().default(null),
  elements: z.array(SlideElementSchema).default([]),
  notes: z.string().default(""),
});
export type Slide = z.infer<typeof SlideSchema>;

export const DeckBodySchema = z.object({
  slides: z.array(SlideSchema).default([]),
  theme: z
    .object({
      background: ColorSchema.default("#ffffff"),
      text: ColorSchema.default("#16181d"),
      accent: ColorSchema.default("#4f46e5"),
      muted: ColorSchema.default("#61666e"),
    })
    .default({
      background: "#ffffff",
      text: "#16181d",
      accent: "#4f46e5",
      muted: "#61666e",
    }),
});
export type DeckBody = z.infer<typeof DeckBodySchema>;

/* ------------------------------------------------------------------ *
 * PDF — bytes live in the blob table, annotations live here
 * ------------------------------------------------------------------ */

export const ANNOTATION_TYPES = ["highlight", "underline", "strikeout", "box", "note"] as const;
export const AnnotationTypeSchema = z.enum(ANNOTATION_TYPES);
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;

export const AnnotationSchema = z.object({
  id: z.string(),
  /** 1-based page number. */
  page: z.number().int().min(1),
  type: AnnotationTypeSchema,
  /**
   * Normalised page coordinates (0..1 of page width/height, origin top-left) so
   * annotations survive zoom changes and different render scales.
   */
  rect: RectSchema,
  color: ColorSchema.default("#f59e0b"),
  /** The text under the annotation, captured at creation time for AI context. */
  quote: z.string().default(""),
  note: z.string().default(""),
  createdAt: z.number().default(0),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const PdfBodySchema = z.object({
  blobId: z.string().nullable().default(null),
  fileName: z.string().default(""),
  pageCount: z.number().int().min(0).default(0),
  annotations: z.array(AnnotationSchema).default([]),
  /** Extracted per-page plain text, filled lazily as pages render. */
  pageText: z.record(z.string(), z.string()).default({}),
});
export type PdfBody = z.infer<typeof PdfBodySchema>;

/* ------------------------------------------------------------------ *
 * Document envelope
 * ------------------------------------------------------------------ */

const docCommon = {
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  schemaVersion: z.number().int().default(SCHEMA_VERSION),
};

export const TextDocSchema = z.object({
  ...docCommon,
  kind: z.literal("text"),
  body: PmNodeSchema,
});

export const CanvasDocSchema = z.object({
  ...docCommon,
  kind: z.literal("canvas"),
  body: CanvasBodySchema,
});

export const DeckDocSchema = z.object({
  ...docCommon,
  kind: z.literal("deck"),
  body: DeckBodySchema,
});

export const PdfDocSchema = z.object({
  ...docCommon,
  kind: z.literal("pdf"),
  body: PdfBodySchema,
});

export const DocSchema = z.discriminatedUnion("kind", [
  TextDocSchema,
  CanvasDocSchema,
  DeckDocSchema,
  PdfDocSchema,
]);

export type TextDoc = z.infer<typeof TextDocSchema>;
export type CanvasDoc = z.infer<typeof CanvasDocSchema>;
export type DeckDoc = z.infer<typeof DeckDocSchema>;
export type PdfDoc = z.infer<typeof PdfDocSchema>;
export type Doc = z.infer<typeof DocSchema>;

/** `DocOf<'deck'>` -> `DeckDoc`. Used to keep the op layer generic but exact. */
export type DocOf<K extends DocKind> = Extract<Doc, { kind: K }>;
export type BodyOf<K extends DocKind> = DocOf<K>["body"];
