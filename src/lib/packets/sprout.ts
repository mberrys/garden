import { DocSchema, type Doc } from "@/lib/docs/schema";
import type { SeedPacket, SproutPane, SproutResult } from "./types";

function paneFromIds(ids: string[]): SproutPane {
  const docIds = [...new Set(ids)];
  return { docIds, activeDocId: docIds[0] ?? null };
}

/**
 * Turns a packet into documents and a pane layout. Pure: no persistence, no
 * React. The workspace store is the only thing that writes the result down.
 */
export function sproutPacket(packet: SeedPacket): SproutResult {
  const localToId = new Map<string, string>();
  const docs: Doc[] = [];

  for (const spec of packet.docs) {
    const built = spec.build();
    const parsed = DocSchema.safeParse({ ...built, title: spec.title, kind: spec.kind });
    if (!parsed.success) {
      throw new Error(
        `Packet "${packet.id}" document "${spec.localId}" failed validation: ${parsed.error.message}`,
      );
    }
    const doc = parsed.data;
    if (doc.kind !== spec.kind) {
      throw new Error(
        `Packet "${packet.id}" document "${spec.localId}" built kind "${doc.kind}", expected "${spec.kind}".`,
      );
    }
    if (localToId.has(spec.localId)) {
      throw new Error(`Packet "${packet.id}" has duplicate document localIds.`);
    }
    localToId.set(spec.localId, doc.id);
    docs.push(doc);
  }

  const pane0: string[] = [];
  const pane1: string[] = [];
  for (const open of packet.open) {
    const id = localToId.get(open.localId);
    if (!id) {
      throw new Error(
        `Packet "${packet.id}" opens "${open.localId}", which is not one of its documents.`,
      );
    }
    if (open.pane === 0) pane0.push(id);
    else if (open.pane === 1) pane1.push(id);
    else {
      const _exhaustive: never = open.pane;
      throw new Error(`Packet "${packet.id}" has an unknown pane: ${_exhaustive}`);
    }
  }

  const panes: [SproutPane, SproutPane] = [paneFromIds(pane0), paneFromIds(pane1)];
  const splitView = packet.splitView ?? panes[1].docIds.length > 0;

  return {
    docs,
    order: docs.map((doc) => doc.id),
    panes,
    splitView,
  };
}
