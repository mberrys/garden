import { Images } from "lucide-react";
import type { MediaDoc } from "@/lib/docs/schema";
import { MediaOpSchema, applyMediaOps } from "@/lib/ops/media";
import { createMediaDoc } from "@/lib/docs/factories";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeMedia(doc: MediaDoc, selection?: SurfaceSelection): string {
  const parts = [
    `Media board "${doc.title}" — ${doc.body.assets.length} asset(s), ${doc.body.groups.length} group(s), layout ${doc.body.layout}.`,
  ];
  for (const asset of doc.body.assets.slice(0, 40)) {
    parts.push(
      `  ${asset.id} ${asset.name || "(unnamed)"} caption="${asset.caption}" tags=${asset.tags.join(",") || "—"}`,
    );
  }
  if (selection?.kind === "media" && selection.assetId) {
    parts.push(`\nUser selected asset ${selection.assetId}`);
  }
  return parts.join("\n");
}

function describeMediaSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "media") return null;
  return selection.assetId ? `The user selected asset ${selection.assetId}` : null;
}

function mockMedia(request: MockRequest): string {
  const doc = request.doc as MediaDoc;
  const ask = request.request.toLowerCase();
  const first = doc.body.assets[0];
  if (/caption|describe/.test(ask) && first) {
    return block("Captioned the first asset.", [
      { op: "setCaption", id: first.id, caption: "Field photograph (scripted caption)" },
    ]);
  }
  if (/group|cluster/.test(ask) && first) {
    return block("Grouped the first asset.", [
      { op: "addGroup", group: { id: "grp_scripted", name: "Key figures" } },
      { op: "updateAsset", id: first.id, patch: { groupId: "grp_scripted" } },
    ]);
  }
  if (/reorder|sort/.test(ask) && doc.body.assets.length > 1) {
    return block("Moved the last asset to the front.", [
      { op: "reorderAsset", id: doc.body.assets[doc.body.assets.length - 1].id, toIndex: 0 },
    ]);
  }
  return block("Added a placeholder card to the board.", [
    { op: "addAsset", asset: { name: "New figure", caption: "Needs a file" } },
  ]);
}

function describeMediaOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "addAsset":
      return "Add media asset";
    case "updateAsset":
      return `Update asset ${op.id}`;
    case "deleteAsset":
      return `Delete asset ${op.id}`;
    case "reorderAsset":
      return `Move asset ${op.id}`;
    case "setCaption":
      return `Caption asset ${op.id}`;
    case "setTags":
      return `Tag asset ${op.id}`;
    case "addGroup":
      return "Add media group";
    case "updateGroup":
      return `Rename group ${op.id}`;
    case "deleteGroup":
      return `Delete group ${op.id}`;
    case "linkAsset":
      return `Link asset ${op.id}`;
    case "setProvenance":
      return `Set provenance on ${op.id}`;
    case "setLayout":
      return `Switch media layout to ${op.layout}`;
    default:
      return undefined;
  }
}

registerSurface({
  kind: "media",
  label: "Media",
  icon: Images,
  iconColor: "#f59e0b",
  opSchema: MediaOpSchema,
  applyOps: applyMediaOps,
  createDoc: createMediaDoc,
  ownsHistory: false,
  contextBudget: 8_000,
  promptNotes:
    "Assets are addressed by id. Captions, tags, groups and document links are Garden ops. " +
    "Do not invent blob ids — leave blobId null unless the user attached a file.",
  serializeDoc: serializeMedia,
  describeSelection: describeMediaSelection,
  mockReply: mockMedia,
  describeOp: describeMediaOp,
  referencedBlobIds: (doc: MediaDoc) => {
    const ids = new Set<string>();
    for (const asset of doc.body.assets) {
      if (asset.blobId) ids.add(asset.blobId);
    }
    return ids;
  },
  remapBlobIds: (doc: MediaDoc, map: Map<string, string>) => {
    if (map.size === 0) return doc;
    return {
      ...doc,
      body: {
        ...doc.body,
        assets: doc.body.assets.map((asset) =>
          asset.blobId && map.has(asset.blobId)
            ? { ...asset, blobId: map.get(asset.blobId)! }
            : asset,
        ),
      },
    };
  },
  adapter: {
    engine: "garden",
    status: "not-required",
    userEdits: "board controls commit addAsset/setCaption/setTags/reorder ops",
    gardenUpdates: "React board re-renders MediaBody",
    selection: "selected asset id",
    notes: "Distinct from Drawing. Shared blob storage, not the canvas scene graph.",
    relatedIssue: 42,
  },
  loadComponent: () => import("@/surfaces/media/media-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}
