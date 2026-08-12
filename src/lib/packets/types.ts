import { z } from "zod";
import { DocKindSchema, type Doc, type DocKind } from "@/lib/docs/schema";
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

export const SeedDocSpecSchema = z.object({
  localId: z.string().min(1),
  kind: DocKindSchema,
  title: z.string().min(1),
  build: BuildFnSchema,
});

export const SeedOpenSpecSchema = z.object({
  localId: z.string().min(1),
  pane: z.union([z.literal(0), z.literal(1)]),
});

export const SeedPacketSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  blurb: z.string().min(1),
  docs: z.array(SeedDocSpecSchema).min(1),
  open: z.array(SeedOpenSpecSchema).min(1),
  splitView: z.boolean().optional(),
  recipes: z.array(PacketRecipeSchema).optional(),
  featuredRecipeIds: z.array(z.string().min(1)).optional(),
  systemPromptAddenda: z.string().optional(),
});

export type SeedDocSpec = z.infer<typeof SeedDocSpecSchema>;
export type SeedOpenSpec = z.infer<typeof SeedOpenSpecSchema>;
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

export function packetSurfaces(packet: SeedPacket): DocKind[] {
  const kinds: DocKind[] = [];
  const seen = new Set<DocKind>();
  for (const doc of packet.docs) {
    if (seen.has(doc.kind)) continue;
    seen.add(doc.kind);
    kinds.push(doc.kind);
  }
  return kinds;
}

/**
 * Schema parse plus referential checks the Zod shape cannot express: unique
 * local ids, open targets that exist, and at least one document on pane 0.
 */
export function parseSeedPacket(input: unknown): SeedPacket {
  const packet = SeedPacketSchema.parse(input);
  const localIds = packet.docs.map((doc) => doc.localId);
  const unique = new Set(localIds);
  if (unique.size !== localIds.length) {
    throw new Error(`Packet "${packet.id}" has duplicate document localIds.`);
  }

  for (const open of packet.open) {
    if (!unique.has(open.localId)) {
      throw new Error(
        `Packet "${packet.id}" opens "${open.localId}", which is not one of its documents.`,
      );
    }
  }

  if (!packet.open.some((open) => open.pane === 0)) {
    throw new Error(`Packet "${packet.id}" must open at least one document in pane 0.`);
  }

  const recipeIds = (packet.recipes ?? []).map((recipe) => recipe.id);
  if (new Set(recipeIds).size !== recipeIds.length) {
    throw new Error(`Packet "${packet.id}" has duplicate recipe ids.`);
  }

  return packet as SeedPacket;
}
