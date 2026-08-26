import { z } from "zod";
import {
  type MediaAsset,
  type MediaBody,
  type MediaGroup,
  ExternalRefSchema,
  GardenRefSchema,
  MediaAssetSchema,
  MediaGroupSchema,
} from "@/lib/docs/schema";
import { newAssetId, newGroupId } from "@/lib/docs/ids";
import { OpError } from "./errors";

export const MediaOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("addAsset"),
      asset: z.object({ id: z.string().optional() }).catchall(z.unknown()),
      index: z.number().int().min(0).optional(),
    })
    .describe("Add an image or file asset to the board"),
  z
    .object({
      op: z.literal("updateAsset"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Update asset metadata"),
  z
    .object({ op: z.literal("deleteAsset"), id: z.string() })
    .describe("Remove an asset from the board"),
  z
    .object({
      op: z.literal("reorderAsset"),
      id: z.string(),
      toIndex: z.number().int().min(0),
    })
    .describe("Move an asset in board order"),
  z
    .object({
      op: z.literal("setCaption"),
      id: z.string(),
      caption: z.string(),
    })
    .describe("Set an asset caption"),
  z
    .object({
      op: z.literal("setTags"),
      id: z.string(),
      tags: z.array(z.string()),
    })
    .describe("Replace an asset's tags"),
  z
    .object({
      op: z.literal("addGroup"),
      group: z.object({ name: z.string(), id: z.string().optional() }),
    })
    .describe("Add a grouping folder on the board"),
  z
    .object({
      op: z.literal("updateGroup"),
      id: z.string(),
      patch: z.object({ name: z.string().optional() }),
    })
    .describe("Rename a group"),
  z
    .object({ op: z.literal("deleteGroup"), id: z.string() })
    .describe("Delete a group and ungroup its assets"),
  z
    .object({
      op: z.literal("linkAsset"),
      id: z.string(),
      links: z.array(GardenRefSchema),
    })
    .describe("Set document links on an asset"),
  z
    .object({
      op: z.literal("setProvenance"),
      id: z.string(),
      provenance: ExternalRefSchema.nullable(),
    })
    .describe("Attach or clear external provenance on an asset"),
  z
    .object({
      op: z.literal("setLayout"),
      layout: z.enum(["board", "list"]),
    })
    .describe("Switch board vs list layout"),
]);

export type MediaOp = z.infer<typeof MediaOpSchema>;

function parseAsset(spec: Record<string, unknown>): MediaAsset {
  const parsed = MediaAssetSchema.safeParse({
    id: newAssetId(),
    blobId: null,
    name: "",
    mime: "application/octet-stream",
    caption: "",
    tags: [],
    groupId: null,
    links: [],
    ...spec,
  });
  if (!parsed.success) throw new OpError(`addAsset: ${parsed.error.message}`);
  return parsed.data;
}

export function applyMediaOps(
  body: MediaBody,
  ops: MediaOp[],
): { body: MediaBody; inverse: MediaOp[] } {
  let assets = body.assets.map((asset) => ({ ...asset, tags: [...asset.tags], links: [...asset.links] }));
  let groups = body.groups.slice();
  let layout = body.layout;
  const inverse: MediaOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "addAsset": {
        const asset = parseAsset(op.asset as Record<string, unknown>);
        if (assets.some((a) => a.id === asset.id)) {
          throw new OpError(`addAsset: asset "${asset.id}" already exists`);
        }
        const at = op.index === undefined ? assets.length : Math.min(op.index, assets.length);
        assets.splice(at, 0, asset);
        inverse.push({ op: "deleteAsset", id: asset.id });
        break;
      }
      case "updateAsset": {
        const index = assets.findIndex((a) => a.id === op.id);
        if (index === -1) throw new OpError(`updateAsset: no asset "${op.id}"`);
        const before = assets[index];
        const merged = { ...before, ...op.patch, id: before.id };
        const parsed = MediaAssetSchema.safeParse(merged);
        if (!parsed.success) throw new OpError(`updateAsset: ${parsed.error.message}`);
        const prior: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          prior[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateAsset", id: op.id, patch: prior });
        assets = assets.slice();
        assets[index] = parsed.data;
        break;
      }
      case "deleteAsset": {
        const index = assets.findIndex((a) => a.id === op.id);
        if (index === -1) throw new OpError(`deleteAsset: no asset "${op.id}"`);
        const [removed] = assets.splice(index, 1);
        inverse.push({
          op: "addAsset",
          asset: removed as unknown as { id?: string } & Record<string, unknown>,
          index,
        });
        break;
      }
      case "reorderAsset": {
        const from = assets.findIndex((a) => a.id === op.id);
        if (from === -1) throw new OpError(`reorderAsset: no asset "${op.id}"`);
        const to = Math.min(op.toIndex, assets.length - 1);
        const [moved] = assets.splice(from, 1);
        assets.splice(to, 0, moved);
        inverse.push({ op: "reorderAsset", id: op.id, toIndex: from });
        break;
      }
      case "setCaption": {
        const asset = assets.find((a) => a.id === op.id);
        if (!asset) throw new OpError(`setCaption: no asset "${op.id}"`);
        inverse.push({ op: "setCaption", id: op.id, caption: asset.caption });
        asset.caption = op.caption;
        break;
      }
      case "setTags": {
        const asset = assets.find((a) => a.id === op.id);
        if (!asset) throw new OpError(`setTags: no asset "${op.id}"`);
        inverse.push({ op: "setTags", id: op.id, tags: [...asset.tags] });
        asset.tags = [...op.tags];
        break;
      }
      case "addGroup": {
        const group: MediaGroup = {
          id: op.group.id ?? newGroupId(),
          name: op.group.name,
        };
        const parsed = MediaGroupSchema.safeParse(group);
        if (!parsed.success) throw new OpError(`addGroup: ${parsed.error.message}`);
        if (groups.some((g) => g.id === parsed.data.id)) {
          throw new OpError(`addGroup: group "${parsed.data.id}" already exists`);
        }
        groups.push(parsed.data);
        inverse.push({ op: "deleteGroup", id: parsed.data.id });
        break;
      }
      case "updateGroup": {
        const index = groups.findIndex((g) => g.id === op.id);
        if (index === -1) throw new OpError(`updateGroup: no group "${op.id}"`);
        const before = groups[index];
        inverse.push({ op: "updateGroup", id: op.id, patch: { name: before.name } });
        groups = groups.slice();
        groups[index] = { ...before, name: op.patch.name ?? before.name };
        break;
      }
      case "deleteGroup": {
        const index = groups.findIndex((g) => g.id === op.id);
        if (index === -1) throw new OpError(`deleteGroup: no group "${op.id}"`);
        const [removed] = groups.splice(index, 1);
        assets = assets.map((asset) =>
          asset.groupId === op.id ? { ...asset, groupId: null } : asset,
        );
        inverse.push({ op: "addGroup", group: { id: removed.id, name: removed.name } });
        break;
      }
      case "linkAsset": {
        const asset = assets.find((a) => a.id === op.id);
        if (!asset) throw new OpError(`linkAsset: no asset "${op.id}"`);
        inverse.push({ op: "linkAsset", id: op.id, links: [...asset.links] });
        asset.links = [...op.links];
        break;
      }
      case "setProvenance": {
        const asset = assets.find((a) => a.id === op.id);
        if (!asset) throw new OpError(`setProvenance: no asset "${op.id}"`);
        inverse.push({
          op: "setProvenance",
          id: op.id,
          provenance: asset.provenance ?? null,
        });
        if (op.provenance === null) delete asset.provenance;
        else asset.provenance = op.provenance;
        break;
      }
      case "setLayout": {
        inverse.push({ op: "setLayout", layout });
        layout = op.layout;
        break;
      }
      default: {
        const _exhaustive: never = op;
        throw new OpError(`unknown media op: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return {
    body: { layout, assets, groups },
    inverse: inverse.reverse(),
  };
}
