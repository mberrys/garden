import Dexie, { type EntityTable } from "dexie";
import type { Doc } from "@/lib/docs/schema";
import { migrateDoc } from "@/lib/docs/migrations";

/**
 * Local persistence.
 *
 * Everything the user makes lives in their browser. Documents are stored as
 * plain JSON (structured-cloneable by construction — the schemas contain no
 * class instances), and binary payloads like PDF bytes live in a separate
 * table so a document row stays small and cheap to rewrite on every keystroke.
 */

export interface StoredBlob {
  id: string;
  name: string;
  mime: string;
  data: Blob;
  createdAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class WorkspaceDb extends Dexie {
  docs!: EntityTable<Doc, "id">;
  blobs!: EntityTable<StoredBlob, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor() {
    super("garden-workspace");
    this.version(1).stores({
      docs: "id, kind, updatedAt",
      blobs: "id, createdAt",
      meta: "key",
    });
  }
}

let instance: WorkspaceDb | null = null;

/** Returns the database, or null during SSR where IndexedDB does not exist. */
export function db(): WorkspaceDb | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!instance) instance = new WorkspaceDb();
  return instance;
}

export interface LoadedWorkspace {
  docs: Doc[];
  order: string[];
  /** Documents that failed validation, reported to the user rather than dropped. */
  broken: { id: string; error: string }[];
}

export async function loadWorkspace(): Promise<LoadedWorkspace> {
  const database = db();
  if (!database) return { docs: [], order: [], broken: [] };

  const [rows, orderRow] = await Promise.all([
    database.docs.toArray(),
    database.meta.get("order"),
  ]);

  const docs: Doc[] = [];
  const broken: { id: string; error: string }[] = [];

  for (const row of rows) {
    const result = migrateDoc(row);
    if (result.ok && result.doc) docs.push(result.doc);
    else {
      broken.push({
        id: (row as { id?: string }).id ?? "(unknown)",
        error: result.error ?? "failed validation",
      });
    }
  }

  const storedOrder = Array.isArray(orderRow?.value) ? (orderRow.value as string[]) : [];
  const known = new Set(docs.map((d) => d.id));
  // Keep the stored order, then append anything it does not mention (e.g. a doc
  // written by another tab since this order was saved).
  const order = [
    ...storedOrder.filter((id) => known.has(id)),
    ...docs.filter((d) => !storedOrder.includes(d.id)).map((d) => d.id),
  ];

  return { docs, order, broken };
}

export async function saveDoc(doc: Doc): Promise<void> {
  await db()?.docs.put(doc);
}

export async function deleteDocRow(id: string): Promise<void> {
  await db()?.docs.delete(id);
}

export async function saveOrder(order: string[]): Promise<void> {
  await db()?.meta.put({ key: "order", value: order });
}

export async function readMeta<T>(key: string): Promise<T | undefined> {
  const row = await db()?.meta.get(key);
  return row?.value as T | undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  await db()?.meta.put({ key, value });
}

export async function putBlob(blob: StoredBlob): Promise<void> {
  await db()?.blobs.put(blob);
}

export async function getBlob(id: string): Promise<StoredBlob | undefined> {
  return db()?.blobs.get(id);
}

export async function deleteBlob(id: string): Promise<void> {
  await db()?.blobs.delete(id);
}

/**
 * Removes blobs no longer referenced by any document. Runs after a document is
 * deleted — without it, deleting a PDF would leave its (often multi-megabyte)
 * bytes in the user's storage quota forever.
 */
export async function collectOrphanBlobs(docs: Doc[]): Promise<number> {
  const database = db();
  if (!database) return 0;

  const referenced = new Set<string>();
  for (const doc of docs) {
    if (doc.kind === "pdf" && doc.body.blobId) referenced.add(doc.body.blobId);
    if (doc.kind === "deck") {
      for (const slide of doc.body.slides) {
        for (const el of slide.elements) {
          if (el.type === "image" && el.blobId) referenced.add(el.blobId);
        }
      }
    }
  }

  const all = await database.blobs.toArray();
  const orphans = all.filter((b) => !referenced.has(b.id)).map((b) => b.id);
  if (orphans.length) await database.blobs.bulkDelete(orphans);
  return orphans.length;
}

/** Wipes the workspace. Used by the "reset workspace" action. */
export async function clearWorkspace(): Promise<void> {
  const database = db();
  if (!database) return;
  await Promise.all([database.docs.clear(), database.blobs.clear(), database.meta.clear()]);
}
