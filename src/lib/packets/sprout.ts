import { DocSchema, type DatabaseDoc, type Doc } from "@/lib/docs/schema";
import { createDatabaseDoc } from "@/lib/docs/factories";
import { applyLinkSeeds, databaseFromSeed } from "./build-database";
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
  const rowLocalToId = new Map<string, string>();
  const docs: Doc[] = [];
  const databaseDocs: DatabaseDoc[] = [];

  for (const spec of packet.starterArtifacts) {
    const built = spec.build();
    const parsed = DocSchema.safeParse({ ...built, title: spec.title, kind: spec.kind });
    if (!parsed.success) {
      throw new Error(
        `Packet "${packet.id}" artifact "${spec.localId}" failed validation: ${parsed.error.message}`,
      );
    }
    const doc = parsed.data;
    if (doc.kind !== spec.kind) {
      throw new Error(
        `Packet "${packet.id}" artifact "${spec.localId}" built kind "${doc.kind}", expected "${spec.kind}".`,
      );
    }
    if (localToId.has(spec.localId)) {
      throw new Error(`Packet "${packet.id}" has duplicate localIds.`);
    }
    localToId.set(spec.localId, doc.id);
    docs.push(doc);
  }

  // Pre-allocate an id for every base before building any of them. A relation
  // field may target any starter base (including a later one or the base's own
  // id); resolving against the complete map avoids an unresolved-target error.
  const starterBases = packet.starterBases ?? [];
  const baseEnvelopes: DatabaseDoc[] = starterBases.map((seed) =>
    createDatabaseDoc(seed.title),
  );
  starterBases.forEach((seed, i) => {
    localToId.set(seed.localId, baseEnvelopes[i].id);
  });

  starterBases.forEach((baseSeed, i) => {
    const dbDoc = databaseFromSeed(baseSeed, localToId, baseEnvelopes[i]);
    (baseSeed.rows ?? []).forEach((rowSeed, j) => {
      const row = dbDoc.body.rows[j];
      if (row) rowLocalToId.set(rowSeed.localId, row.id);
    });
    databaseDocs.push(dbDoc);
    docs.push(dbDoc);
  });

  if (packet.links?.length) {
    const linked = applyLinkSeeds(databaseDocs, localToId, rowLocalToId, packet.links);
    for (const linkedDoc of linked) {
      const idx = docs.findIndex((d) => d.id === linkedDoc.id);
      if (idx >= 0) docs[idx] = linkedDoc;
    }
  }

  const pane0: string[] = [];
  const pane1: string[] = [];
  for (const open of packet.layout.open) {
    const id = localToId.get(open.localId);
    if (!id) {
      throw new Error(
        `Packet "${packet.id}" opens "${open.localId}", which is not one of its artifacts or bases.`,
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
  const splitView = packet.layout.splitView ?? panes[1].docIds.length > 0;

  return {
    docs,
    order: docs.map((doc) => doc.id),
    panes,
    splitView,
  };
}
