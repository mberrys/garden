import { z } from "zod";
import {
  EvidenceRefSchema,
  ExternalRefSchema,
  GardenRefSchema,
} from "@/lib/refs/schema";

export {
  AnchorRefSchema,
  EvidenceRefSchema,
  ExternalRefSchema,
  GardenRefSchema,
  gardenRef,
  type AnchorRef,
  type EvidenceRef,
  type ExternalRef,
  type GardenRef,
} from "@/lib/refs/schema";

/**
 * The document model for every surface in the suite.
 *
 * Zod schemas are the single source of truth: TypeScript types are derived with
 * `z.infer`, the persistence layer validates on read, and the AI layer converts
 * these same schemas to JSON Schema for tool definitions. One definition, three
 * consumers — so a model can never emit a shape the app does not understand.
 */

export const SCHEMA_VERSION = 2;

/**
 * Closed-union checklist when adding a kind. Registration alone is not enough:
 * `workspace.newDoc` calls `factories.createDoc`, and `parseOps` validates
 * against `OP_SCHEMAS`, not the surface registry.
 *
 * 1. `DOC_KINDS` / `DocSchema` / `DOC_KIND_LABELS`
 * 2. `factories.createDoc`
 * 3. `OpMap` / `OP_SCHEMAS` / `AnyOp`
 * 4. `SurfaceSelection`
 * 5. `SurfaceDefinition.adapter` on the `*.register.ts` module
 * 6. `surfaces/index.ts` side-effect import
 * 7. `ai.test.ts` fixture
 * 8. e2e `newDocument` labels
 */
export const DOC_KINDS = [
  "text",
  "pdf",
  "deck",
  "canvas",
  "sheet",
  "database",
  "media",
  "mini",
] as const;
export const DocKindSchema = z.enum(DOC_KINDS);
export type DocKind = z.infer<typeof DocKindSchema>;

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  text: "Document",
  pdf: "PDF",
  deck: "Deck",
  canvas: "Canvas",
  sheet: "Sheet",
  database: "Database",
  media: "Media",
  mini: "Mini-tool",
};

/** Surfaces a packet may require; used for capability gating in the picker. */
export const PACKET_CAPABILITIES = ["relations", "external_ref", "garden_ref"] as const;
export type PacketCapability = (typeof PACKET_CAPABILITIES)[number];

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

/** Page-normalised rectangle (0..1 of page width/height). */
export const NormalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;

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
 * Text documents — ProseMirror JSON (edited with a ProseMirror view)
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
  radius: z.number().min(0).max(200).default(0),
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
  /** Fillet radius at polyline corners; 0 is sharp. */
  cornerRadius: z.number().min(0).max(200).default(0),
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
  /** 0 = angular, 1 = very smooth freehand curves. */
  smoothing: z.number().min(0).max(1).default(0.6),
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
  cornerRadius: z.number().min(0).max(200).default(0),
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
  rect: NormalizedRectSchema,
  color: ColorSchema.default("#f59e0b"),
  /** The text under the annotation, captured at creation time for AI context. */
  quote: z.string().default(""),
  note: z.string().default(""),
  createdAt: z.number().default(0),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const PageCitationSchema = z.object({
  id: z.string(),
  page: z.number().int().min(1),
  quote: z.string().default(""),
  annotationId: z.string().optional(),
});
export type PageCitation = z.infer<typeof PageCitationSchema>;

export const PdfBodySchema = z.object({
  blobId: z.string().nullable().default(null),
  fileName: z.string().default(""),
  pageCount: z.number().int().min(0).default(0),
  annotations: z.array(AnnotationSchema).default([]),
  /** Extracted per-page plain text, filled lazily as pages render. */
  pageText: z.record(z.string(), z.string()).default({}),
  evidence: z.array(EvidenceRefSchema).default([]),
  citations: z.array(PageCitationSchema).default([]),
});
export type PdfBody = z.infer<typeof PdfBodySchema>;

/* ------------------------------------------------------------------ *
 * Sheet — a grid of cells addressed by A1 references
 * ------------------------------------------------------------------ */

/** Upper bounds on the grid; generous for a browser doc, small enough to fit. */
export const SHEET_MAX_ROWS = 500;
export const SHEET_MAX_COLS = 52; // A..AZ

export const CellAlignSchema = z.enum(["left", "center", "right"]);
export type CellAlign = z.infer<typeof CellAlignSchema>;

/** How a cell's *computed* value is rendered; the raw string is unchanged. */
export const CellFormatSchema = z.enum(["auto", "number", "currency", "percent", "text"]);
export type CellFormat = z.infer<typeof CellFormatSchema>;

/**
 * A single cell. `value` is the raw user input — a leading `=` marks a formula.
 * Computed values are derived at render time (see `lib/sheet`), never stored, so
 * the op reducer stays pure and every edit inverts exactly.
 */
export const SheetCellSchema = z.object({
  value: z.string().default(""),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  align: CellAlignSchema.default("left"),
  format: CellFormatSchema.default("auto"),
});
export type SheetCell = z.infer<typeof SheetCellSchema>;

/** Style fields a `setStyle` op may patch — the cell shape minus `value`. */
export const CellStylePatchSchema = z
  .object({
    bold: z.boolean(),
    italic: z.boolean(),
    align: CellAlignSchema,
    format: CellFormatSchema,
  })
  .partial();
export type CellStylePatch = z.infer<typeof CellStylePatchSchema>;

export const SheetBodySchema = z.object({
  rows: z.number().int().min(1).max(SHEET_MAX_ROWS).default(20),
  cols: z.number().int().min(1).max(SHEET_MAX_COLS).default(8),
  /** Sparse map keyed by A1 ref (e.g. "B3"); empty cells are omitted. */
  cells: z.record(z.string(), SheetCellSchema).default({}),
  /** Pixel widths keyed by column letter (e.g. "A"); defaulted when absent. */
  columnWidths: z.record(z.string(), z.number().min(24).max(640)).default({}),
});
export type SheetBody = z.infer<typeof SheetBodySchema>;

/* ------------------------------------------------------------------ *
 * Database — typed fields, rows, grid + kanban views
 * ------------------------------------------------------------------ */

export const DATABASE_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "relation",
  "file",
  "garden_ref",
  "external_ref",
] as const;
export const DatabaseFieldTypeSchema = z.enum(DATABASE_FIELD_TYPES);
export type DatabaseFieldType = z.infer<typeof DatabaseFieldTypeSchema>;

const fieldCommon = {
  id: z.string(),
  name: z.string(),
  /** Observed/imported facts stay distinct from derived interpretation. */
  origin: z.enum(["observed", "derived", "imported"]).optional(),
};

export const TextFieldSchema = z.object({ ...fieldCommon, type: z.literal("text") });
export const NumberFieldSchema = z.object({ ...fieldCommon, type: z.literal("number") });
export const DateFieldSchema = z.object({ ...fieldCommon, type: z.literal("date") });
export const SelectFieldSchema = z.object({
  ...fieldCommon,
  type: z.literal("select"),
  options: z.array(z.string()).default([]),
});
export const MultiSelectFieldSchema = z.object({
  ...fieldCommon,
  type: z.literal("multi_select"),
  options: z.array(z.string()).default([]),
});
export const CheckboxFieldSchema = z.object({ ...fieldCommon, type: z.literal("checkbox") });
export const UrlFieldSchema = z.object({ ...fieldCommon, type: z.literal("url") });
export const RelationFieldSchema = z.object({
  ...fieldCommon,
  type: z.literal("relation"),
  targetDocId: z.string(),
});
export const FileFieldSchema = z.object({ ...fieldCommon, type: z.literal("file") });
export const GardenRefFieldSchema = z.object({ ...fieldCommon, type: z.literal("garden_ref") });
export const ExternalRefFieldSchema = z.object({
  ...fieldCommon,
  type: z.literal("external_ref"),
});

export const DatabaseFieldSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  NumberFieldSchema,
  DateFieldSchema,
  SelectFieldSchema,
  MultiSelectFieldSchema,
  CheckboxFieldSchema,
  UrlFieldSchema,
  RelationFieldSchema,
  FileFieldSchema,
  GardenRefFieldSchema,
  ExternalRefFieldSchema,
]);
export type DatabaseField = z.infer<typeof DatabaseFieldSchema>;

export const DATABASE_VIEW_TYPES = ["grid", "kanban", "calendar"] as const;
export const DatabaseViewTypeSchema = z.enum(DATABASE_VIEW_TYPES);
export type DatabaseViewType = z.infer<typeof DatabaseViewTypeSchema>;

export const VIEW_FILTER_OPS = ["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"] as const;
export const ViewFilterOpSchema = z.enum(VIEW_FILTER_OPS);
export type ViewFilterOp = z.infer<typeof ViewFilterOpSchema>;

export const ViewFilterSchema = z.object({
  fieldId: z.string(),
  op: ViewFilterOpSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});
export type ViewFilter = z.infer<typeof ViewFilterSchema>;

const viewCommon = {
  id: z.string(),
  name: z.string(),
};

export const GridViewSchema = z.object({
  ...viewCommon,
  type: z.literal("grid"),
  hiddenFieldIds: z.array(z.string()).default([]),
  sortFieldId: z.string().nullable().default(null),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  filters: z.array(ViewFilterSchema).default([]),
});

export const KanbanViewSchema = z.object({
  ...viewCommon,
  type: z.literal("kanban"),
  groupFieldId: z.string(),
  filters: z.array(ViewFilterSchema).default([]),
});

export const CalendarViewSchema = z.object({
  ...viewCommon,
  type: z.literal("calendar"),
  dateFieldId: z.string(),
  filters: z.array(ViewFilterSchema).default([]),
});

export const DatabaseViewSchema = z.discriminatedUnion("type", [
  GridViewSchema,
  KanbanViewSchema,
  CalendarViewSchema,
]);
export type DatabaseView = z.infer<typeof DatabaseViewSchema>;

export const CellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  GardenRefSchema,
  ExternalRefSchema,
  z.null(),
]);
export type CellValue = z.infer<typeof CellValueSchema>;

export const DatabaseRowSchema = z.object({
  id: z.string(),
  cells: z.record(z.string(), CellValueSchema).default({}),
});
export type DatabaseRow = z.infer<typeof DatabaseRowSchema>;

export const DatabaseBodySchema = z.object({
  fields: z.array(DatabaseFieldSchema).default([]),
  rows: z.array(DatabaseRowSchema).default([]),
  views: z.array(DatabaseViewSchema).default([]),
  activeViewId: z.string().nullable().default(null),
});
export type DatabaseBody = z.infer<typeof DatabaseBodySchema>;

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

export const SheetDocSchema = z.object({
  ...docCommon,
  kind: z.literal("sheet"),
  body: SheetBodySchema,
});

export const DatabaseDocSchema = z.object({
  ...docCommon,
  kind: z.literal("database"),
  body: DatabaseBodySchema,
});

export const MediaAssetSchema = z.object({
  id: z.string(),
  blobId: z.string().nullable().default(null),
  name: z.string().default(""),
  mime: z.string().default("application/octet-stream"),
  caption: z.string().default(""),
  tags: z.array(z.string()).default([]),
  groupId: z.string().nullable().default(null),
  provenance: ExternalRefSchema.optional(),
  links: z.array(GardenRefSchema).default([]),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const MediaGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type MediaGroup = z.infer<typeof MediaGroupSchema>;

export const MediaBodySchema = z.object({
  layout: z.enum(["board", "list"]).default("board"),
  assets: z.array(MediaAssetSchema).default([]),
  groups: z.array(MediaGroupSchema).default([]),
});
export type MediaBody = z.infer<typeof MediaBodySchema>;

export const MediaDocSchema = z.object({
  ...docCommon,
  kind: z.literal("media"),
  body: MediaBodySchema,
});

export const MINI_TEMPLATES = ["card-grid", "table", "timeline"] as const;
export const MiniTemplateSchema = z.enum(MINI_TEMPLATES);
export type MiniTemplate = z.infer<typeof MiniTemplateSchema>;

export const MiniFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "number", "date", "select"]),
});
export type MiniField = z.infer<typeof MiniFieldSchema>;

export const MiniDescriptorSchema = z.object({
  id: z.string(),
  label: z.string(),
  template: MiniTemplateSchema,
  fields: z.array(MiniFieldSchema).min(1),
});
export type MiniDescriptor = z.infer<typeof MiniDescriptorSchema>;

export const MiniRecordSchema = z.object({
  id: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type MiniRecord = z.infer<typeof MiniRecordSchema>;

export const MiniBodySchema = z.object({
  descriptor: MiniDescriptorSchema,
  records: z.array(MiniRecordSchema).default([]),
});
export type MiniBody = z.infer<typeof MiniBodySchema>;

export const MiniDocSchema = z.object({
  ...docCommon,
  kind: z.literal("mini"),
  body: MiniBodySchema,
});

export const DocSchema = z.discriminatedUnion("kind", [
  TextDocSchema,
  CanvasDocSchema,
  DeckDocSchema,
  PdfDocSchema,
  SheetDocSchema,
  DatabaseDocSchema,
  MediaDocSchema,
  MiniDocSchema,
]);

export type TextDoc = z.infer<typeof TextDocSchema>;
export type CanvasDoc = z.infer<typeof CanvasDocSchema>;
export type DeckDoc = z.infer<typeof DeckDocSchema>;
export type PdfDoc = z.infer<typeof PdfDocSchema>;
export type SheetDoc = z.infer<typeof SheetDocSchema>;
export type DatabaseDoc = z.infer<typeof DatabaseDocSchema>;
export type MediaDoc = z.infer<typeof MediaDocSchema>;
export type MiniDoc = z.infer<typeof MiniDocSchema>;
export type Doc = z.infer<typeof DocSchema>;

/** `DocOf<'deck'>` -> `DeckDoc`. Used to keep the op layer generic but exact. */
export type DocOf<K extends DocKind> = Extract<Doc, { kind: K }>;
export type BodyOf<K extends DocKind> = DocOf<K>["body"];
