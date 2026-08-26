import type { Doc } from "@/lib/docs/schema";
import type { GardenRef } from "./schema";

export type RefStatus = "ok" | "broken" | "unavailable";

export interface ResolvedGardenRef {
  status: RefStatus;
  ref: GardenRef;
  doc?: Doc;
  label: string;
}

export function resolveGardenRef(
  ref: GardenRef,
  docs: Record<string, Doc>,
): ResolvedGardenRef {
  const doc = docs[ref.documentId];
  if (!doc) {
    return {
      status: "broken",
      ref,
      label: `Broken reference (${ref.documentId})`,
    };
  }

  if (ref.objectId) {
    const found = objectExists(doc, ref.objectId);
    if (!found) {
      return {
        status: "unavailable",
        ref,
        doc,
        label: `${doc.title} · missing ${ref.objectId}`,
      };
    }
  }

  return {
    status: "ok",
    ref,
    doc,
    label: ref.objectId ? `${doc.title} · ${ref.objectId}` : doc.title,
  };
}

function objectExists(doc: Doc, objectId: string): boolean {
  switch (doc.kind) {
    case "text":
      return true;
    case "canvas":
      return doc.body.nodes.some((node) => node.id === objectId);
    case "deck":
      return doc.body.slides.some(
        (slide) => slide.id === objectId || slide.elements.some((el) => el.id === objectId),
      );
    case "pdf":
      return (
        doc.body.annotations.some((a) => a.id === objectId) ||
        doc.body.evidence.some((e) => e.id === objectId) ||
        doc.body.citations.some((c) => c.id === objectId)
      );
    case "sheet":
      return objectId in doc.body.cells;
    case "database":
      return doc.body.rows.some((row) => row.id === objectId);
    case "media":
      return (
        doc.body.assets.some((asset) => asset.id === objectId) ||
        doc.body.groups.some((group) => group.id === objectId)
      );
    case "mini":
      return doc.body.records.some((record) => record.id === objectId);
    default: {
      const _exhaustive: never = doc;
      return _exhaustive;
    }
  }
}

export function upgradeLegacyGardenRef(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.documentId !== "string") return raw;
  if (obj.version === 1) return raw;
  return {
    version: 1,
    documentId: obj.documentId,
    ...(typeof obj.objectId === "string" ? { objectId: obj.objectId } : {}),
    ...(typeof obj.workspaceId === "string" ? { workspaceId: obj.workspaceId } : {}),
    ...(obj.anchor ? { anchor: obj.anchor } : {}),
  };
}
