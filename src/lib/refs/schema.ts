import { z } from "zod";

/**
 * Shared provenance primitives.
 *
 * Packets and surfaces reuse these types rather than inventing profession-specific
 * reference shapes. Identity, anchors, evidence relations, and external freshness
 * live here; Claim / Theme / Finding records stay in Bases.
 */

export const ANCHOR_KINDS = ["text", "pdf-text", "region", "media-time"] as const;
export const AnchorKindSchema = z.enum(ANCHOR_KINDS);
export type AnchorKind = z.infer<typeof AnchorKindSchema>;

export const TextAnchorSchema = z.object({
  kind: z.literal("text"),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  snapshot: z.string().optional(),
});

export const PdfTextAnchorSchema = z.object({
  kind: z.literal("pdf-text"),
  page: z.number().int().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  snapshot: z.string().optional(),
});

export const RegionAnchorSchema = z.object({
  kind: z.literal("region"),
  page: z.number().int().min(1).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const MediaTimeAnchorSchema = z.object({
  kind: z.literal("media-time"),
  startMs: z.number().min(0),
  endMs: z.number().min(0),
});

export const AnchorRefSchema = z.discriminatedUnion("kind", [
  TextAnchorSchema,
  PdfTextAnchorSchema,
  RegionAnchorSchema,
  MediaTimeAnchorSchema,
]);
export type AnchorRef = z.infer<typeof AnchorRefSchema>;

const GardenRefShape = z.object({
  version: z.literal(1),
  workspaceId: z.string().optional(),
  documentId: z.string(),
  objectId: z.string().optional(),
  anchor: AnchorRefSchema.optional(),
});

/**
 * Versioned cross-surface pointer. v1 cells stored `{ documentId, objectId? }`;
 * preprocess lifts those into the canonical shape so unmigrated rows still parse.
 */
export const GardenRefSchema: z.ZodType<z.infer<typeof GardenRefShape>> = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    if (obj.version === undefined && typeof obj.documentId === "string") {
      return { version: 1, ...obj };
    }
    return raw;
  },
  GardenRefShape,
);
export type GardenRef = z.infer<typeof GardenRefShape>;

export const EVIDENCE_RELATIONS = [
  "supports",
  "contradicts",
  "qualifies",
  "contextualizes",
] as const;
export const EvidenceRelationSchema = z.enum(EVIDENCE_RELATIONS);
export type EvidenceRelation = z.infer<typeof EvidenceRelationSchema>;

export const CAPTURE_SOURCES = ["human", "ai", "import"] as const;
export const CaptureSourceSchema = z.enum(CAPTURE_SOURCES);
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

export const EvidenceRefSchema = z.object({
  id: z.string(),
  source: GardenRefSchema,
  relation: EvidenceRelationSchema,
  capturedBy: CaptureSourceSchema,
  verificationStatus: z.string().optional(),
  note: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const ExternalRefSchema = z.object({
  provider: z.string(),
  externalId: z.string().optional(),
  url: z.string().optional(),
  importedAt: z.string().optional(),
  sourceUpdatedAt: z.string().optional(),
  snapshotHash: z.string().optional(),
  freshness: z.enum(["fresh", "stale", "unknown"]).optional(),
  snapshotProvenance: z.string().optional(),
});
export type ExternalRef = z.infer<typeof ExternalRefSchema>;

export function gardenRef(partial: {
  documentId: string;
  workspaceId?: string;
  objectId?: string;
  anchor?: AnchorRef;
}): GardenRef {
  return {
    version: 1,
    documentId: partial.documentId,
    ...(partial.workspaceId ? { workspaceId: partial.workspaceId } : {}),
    ...(partial.objectId ? { objectId: partial.objectId } : {}),
    ...(partial.anchor ? { anchor: partial.anchor } : {}),
  };
}

export function isGardenRef(value: unknown): value is GardenRef {
  return GardenRefSchema.safeParse(value).success;
}

export function isExternalRef(value: unknown): value is ExternalRef {
  return ExternalRefSchema.safeParse(value).success;
}
