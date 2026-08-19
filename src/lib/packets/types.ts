import { z } from "zod";
import {
  CellValueSchema,
  DOC_KINDS,
  DocKindSchema,
  PACKET_CAPABILITIES,
  type Doc,
  type DocKind,
} from "@/lib/docs/schema";
import type { Recipe } from "@/lib/ai/recipes";

/**
 * A profession-shaped starting kit. Packets are data (TS modules + builders),
 * not React trees: the picker renders the registry, and `sproutPacket` turns
 * a packet into documents and a pane layout.
 */

const BuildFnSchema = z.custom<() => Doc>(
  (value) => typeof value === "function",
  { error: "Expected a document builder" },
);

const NewTitleFnSchema = z.custom<(sourceTitle: string) => string>(
  (value) => typeof value === "function",
  { error: "Expected a title function" },
);

export const PacketRecipeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().min(1),
  from: z.array(DocKindSchema).min(1),
  target: DocKindSchema,
  newTitle: NewTitleFnSchema.optional(),
  prompt: z.string().min(1),
});

export const ArtifactSeedSchema = z.object({
  localId: z.string().min(1),
  kind: DocKindSchema,
  title: z.string().min(1),
  build: BuildFnSchema,
});

export const LayoutOpenSpecSchema = z.object({
  localId: z.string().min(1),
  pane: z.union([z.literal(0), z.literal(1)]),
});

export const LayoutPresetSchema = z.object({
  open: z.array(LayoutOpenSpecSchema).min(1),
  splitView: z.boolean().optional(),
});

const DatabaseFieldSeedSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("text") }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("number") }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("date") }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("select"),
    options: z.array(z.string()).default([]),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("multi_select"),
    options: z.array(z.string()).default([]),
  }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("checkbox") }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("url") }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("relation"),
    targetLocalId: z.string().min(1),
  }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("file") }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("garden_ref") }),
  z.object({ id: z.string().min(1), name: z.string().min(1), type: z.literal("external_ref") }),
]);

export const DatabaseViewSeedSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("grid"),
    hiddenFieldIds: z.array(z.string()).optional(),
    sortFieldId: z.string().nullable().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal("kanban"),
    groupFieldId: z.string().min(1),
  }),
]);

export const DatabaseRowSeedSchema = z.object({
  localId: z.string().min(1),
  cells: z.record(z.string(), CellValueSchema).default({}),
});

export const DatabaseSeedSchema = z.object({
  localId: z.string().min(1),
  title: z.string().min(1),
  fields: z.array(DatabaseFieldSeedSchema).min(1),
  views: z.array(DatabaseViewSeedSchema).min(1),
  rows: z.array(DatabaseRowSeedSchema).optional(),
  activeViewId: z.string().optional(),
});

export const LinkSeedSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("relation"),
    rowLocalId: z.string().min(1),
    fieldId: z.string().min(1),
    targetRowLocalIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    kind: z.literal("garden_ref"),
    rowLocalId: z.string().min(1),
    fieldId: z.string().min(1),
    targetLocalId: z.string().min(1),
    objectId: z.string().optional(),
  }),
]);

export const PacketRequiresSchema = z.object({
  surfaces: z.array(DocKindSchema).optional(),
  capabilities: z.array(z.enum(PACKET_CAPABILITIES)).optional(),
});

export const SeedPacketSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  label: z.string().min(1),
  blurb: z.string().min(1),
  requires: PacketRequiresSchema.optional(),
  starterArtifacts: z.array(ArtifactSeedSchema).min(1),
  starterBases: z.array(DatabaseSeedSchema).optional(),
  links: z.array(LinkSeedSchema).optional(),
  layout: LayoutPresetSchema,
  recipes: z.array(PacketRecipeSchema).optional(),
  featuredRecipeIds: z.array(z.string().min(1)).optional(),
  assistantPromptAddenda: z.array(z.string().min(1)).optional(),
  suggestedFlavors: z.array(z.string().min(1)).optional(),
});

export type ArtifactSeed = z.infer<typeof ArtifactSeedSchema>;
export type LayoutOpenSpec = z.infer<typeof LayoutOpenSpecSchema>;
export type LayoutPreset = z.infer<typeof LayoutPresetSchema>;
export type DatabaseSeed = z.infer<typeof DatabaseSeedSchema>;
export type LinkSeed = z.infer<typeof LinkSeedSchema>;
export type SeedPacket = z.infer<typeof SeedPacketSchema> & {
  recipes?: Recipe[];
};

export interface SproutPane {
  docIds: string[];
  activeDocId: string | null;
}

export interface SproutResult {
  docs: Doc[];
  order: string[];
  panes: [SproutPane, SproutPane];
  splitView: boolean;
}

export function packetAssistantAddenda(packet: SeedPacket | undefined): string | undefined {
  if (!packet) return undefined;
  const parts = packet.assistantPromptAddenda ?? [];
  if (parts.length === 0) return undefined;
  return parts.join("\n");
}

export function packetArtifactCount(packet: SeedPacket): number {
  return packet.starterArtifacts.length + (packet.starterBases?.length ?? 0);
}

export function packetNeedsPreview(packet: SeedPacket): boolean {
  return (
    (packet.starterBases?.length ?? 0) > 0 ||
    (packet.links?.length ?? 0) > 0 ||
    packetArtifactCount(packet) > 4
  );
}

export function packetSurfaces(packet: SeedPacket): DocKind[] {
  const kinds: DocKind[] = [];
  const seen = new Set<DocKind>();
  for (const artifact of packet.starterArtifacts) {
    if (seen.has(artifact.kind)) continue;
    seen.add(artifact.kind);
    kinds.push(artifact.kind);
  }
  if (packet.starterBases?.length) {
    if (!seen.has("database")) {
      seen.add("database");
      kinds.push("database");
    }
  }
  return kinds;
}

export interface PacketAvailability {
  available: boolean;
  reason?: string;
}

export function packetAvailability(packet: SeedPacket): PacketAvailability {
  const requiredSurfaces = packet.requires?.surfaces ?? [];
  for (const surface of requiredSurfaces) {
    if (!DOC_KINDS.includes(surface)) {
      return {
        available: false,
        reason: `Requires unsupported surface "${surface}"`,
      };
    }
  }
  const requiredCaps = packet.requires?.capabilities ?? [];
  for (const cap of requiredCaps) {
    if (!PACKET_CAPABILITIES.includes(cap)) {
      return {
        available: false,
        reason: `Requires unsupported capability "${cap}"`,
      };
    }
  }
  return { available: true };
}

/**
 * Schema parse plus referential checks the Zod shape cannot express: unique
 * local ids, open targets that exist, and at least one document on pane 0.
 */
export function parseSeedPacket(input: unknown): SeedPacket {
  const packet = SeedPacketSchema.parse(input);
  const localIds = [
    ...packet.starterArtifacts.map((a) => a.localId),
    ...(packet.starterBases?.map((b) => b.localId) ?? []),
  ];
  const unique = new Set(localIds);
  if (unique.size !== localIds.length) {
    throw new Error(`Packet "${packet.id}" has duplicate localIds across artifacts and bases.`);
  }

  for (const open of packet.layout.open) {
    if (!unique.has(open.localId)) {
      throw new Error(
        `Packet "${packet.id}" opens "${open.localId}", which is not one of its artifacts or bases.`,
      );
    }
  }

  if (!packet.layout.open.some((open) => open.pane === 0)) {
    throw new Error(`Packet "${packet.id}" must open at least one document in pane 0.`);
  }

  const baseLocalIds = new Set(packet.starterBases?.map((b) => b.localId) ?? []);
  for (const base of packet.starterBases ?? []) {
    const fieldIds = new Set(base.fields.map((f) => f.id));
    if (fieldIds.size !== base.fields.length) {
      throw new Error(`Packet "${packet.id}" base "${base.localId}" has duplicate field ids.`);
    }
    for (const view of base.views) {
      if (view.type === "kanban" && !fieldIds.has(view.groupFieldId)) {
        throw new Error(
          `Packet "${packet.id}" kanban view "${view.id}" references unknown field "${view.groupFieldId}".`,
        );
      }
      if (view.type === "grid" && view.sortFieldId && !fieldIds.has(view.sortFieldId)) {
        throw new Error(
          `Packet "${packet.id}" grid view "${view.id}" references unknown sort field "${view.sortFieldId}".`,
        );
      }
    }
    for (const field of base.fields) {
      if (field.type === "relation" && !baseLocalIds.has(field.targetLocalId)) {
        throw new Error(
          `Packet "${packet.id}" relation field "${field.id}" targets unknown base "${field.targetLocalId}".`,
        );
      }
    }
    const rowLocalIds = new Set((base.rows ?? []).map((r) => r.localId));
    if (rowLocalIds.size !== (base.rows?.length ?? 0)) {
      throw new Error(`Packet "${packet.id}" base "${base.localId}" has duplicate row localIds.`);
    }
    if (base.activeViewId && !base.views.some((v) => v.id === base.activeViewId)) {
      throw new Error(
        `Packet "${packet.id}" base "${base.localId}" activeViewId "${base.activeViewId}" is unknown.`,
      );
    }
  }

  for (const link of packet.links ?? []) {
    const rowBase = packet.starterBases?.find((b) =>
      (b.rows ?? []).some((r) => r.localId === link.rowLocalId),
    );
    if (!rowBase) {
      throw new Error(
        `Packet "${packet.id}" link references unknown row localId "${link.rowLocalId}".`,
      );
    }
    if (!rowBase.fields.some((f) => f.id === link.fieldId)) {
      throw new Error(
        `Packet "${packet.id}" link references unknown field "${link.fieldId}" on base "${rowBase.localId}".`,
      );
    }
    if (link.kind === "garden_ref" && !unique.has(link.targetLocalId)) {
      throw new Error(
        `Packet "${packet.id}" garden_ref link targets unknown localId "${link.targetLocalId}".`,
      );
    }
    if (link.kind === "relation") {
      for (const targetRowLocalId of link.targetRowLocalIds) {
        const targetBase = packet.starterBases?.find((b) =>
          (b.rows ?? []).some((r) => r.localId === targetRowLocalId),
        );
        if (!targetBase) {
          throw new Error(
            `Packet "${packet.id}" relation link references unknown row "${targetRowLocalId}".`,
          );
        }
        const field = rowBase.fields.find((f) => f.id === link.fieldId);
        if (field?.type === "relation" && field.targetLocalId !== targetBase.localId) {
          throw new Error(
            `Packet "${packet.id}" relation link row "${targetRowLocalId}" is not in target base "${field.targetLocalId}".`,
          );
        }
      }
    }
  }

  const recipeIds = (packet.recipes ?? []).map((recipe) => recipe.id);
  if (new Set(recipeIds).size !== recipeIds.length) {
    throw new Error(`Packet "${packet.id}" has duplicate recipe ids.`);
  }

  return packet as SeedPacket;
}
