"use client";

import { z } from "zod";
import { DocSchema, type Doc } from "@/lib/docs/schema";
import { migrateDoc } from "@/lib/docs/migrations";
import { createPdfDoc, createTextDoc } from "@/lib/docs/factories";
import { markdownToDoc } from "@/lib/text/markdown";
import { applyOps } from "@/lib/ops";
import { getSurface } from "@/lib/surfaces/registry";
import { formatForFilename, importOfficeFile } from "@/lib/interchange";
import * as db from "./db";
import { flushPendingSaves, storeBlob, useWorkspace } from "./workspace";

/**
 * Workspace import/export.
 *
 * The `.gardenspace` bundle is a plain JSON file with blobs inlined as base64. It
 * is the escape hatch from browser-local storage: without it, clearing site
 * data would be unrecoverable.
 */

export const BUNDLE_VERSION = 1;
export const BUNDLE_EXTENSION = ".gardenspace";

const BundleBlobSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  /** base64, no data: prefix */
  data: z.string(),
});

const BundleSchema = z.object({
  format: z.literal("gardenspace"),
  version: z.number().int().min(1),
  exportedAt: z.number(),
  order: z.array(z.string()).default([]),
  docs: z.array(z.unknown()),
  blobs: z.array(BundleBlobSchema).default([]),
  /** Packet that sprouted the workspace, when the export is a full snapshot. */
  seedPacketId: z.string().nullable().optional(),
  seedPacketVersion: z.number().int().nullable().optional(),
});

export type Bundle = z.infer<typeof BundleSchema>;

/* ------------------------------------------------------------------ *
 * base64
 * ------------------------------------------------------------------ */

// Chunked so a 40MB PDF does not blow the argument limit of String.fromCharCode.
const CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/** Blob ids reachable from a set of documents. */
function referencedBlobIds(docs: Doc[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const id of getSurface(doc.kind).referencedBlobIds(doc)) {
      ids.add(id);
    }
  }
  return ids;
}

export async function exportBundle(docIds?: string[]): Promise<Blob> {
  await flushPendingSaves();
  const state = useWorkspace.getState();
  const selected = docIds ?? state.order;
  const docs = selected.map((id) => state.docs[id]).filter((d): d is Doc => Boolean(d));

  const blobs: Bundle["blobs"] = [];
  for (const id of referencedBlobIds(docs)) {
    const row = await db.getBlob(id);
    if (!row) continue;
    const bytes = new Uint8Array(await row.data.arrayBuffer());
    blobs.push({ id: row.id, name: row.name, mime: row.mime, data: bytesToBase64(bytes) });
  }

  const bundle: Bundle = {
    format: "gardenspace",
    version: BUNDLE_VERSION,
    exportedAt: Date.now(),
    order: docs.map((d) => d.id),
    docs,
    blobs,
    ...(docIds === undefined
      ? { seedPacketId: state.seedPacketId, seedPacketVersion: state.seedPacketVersion }
      : {}),
  };

  return new Blob([JSON.stringify(bundle)], { type: "application/json" });
}

export interface ImportResult {
  imported: number;
  skipped: { title: string; error: string }[];
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

export async function importBundle(text: string): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  const parsed = BundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`That file is not an ${BUNDLE_EXTENSION} bundle.`);
  }
  if (parsed.data.version > BUNDLE_VERSION) {
    throw new Error(
      `This bundle was exported by a newer version (v${parsed.data.version}); update the app first.`,
    );
  }

  const store = useWorkspace.getState();
  const skipped: ImportResult["skipped"] = [];

  // Blob ids are remapped: a bundle exported from another browser may collide
  // with ids already present here.
  const blobIdMap = new Map<string, string>();
  for (const entry of parsed.data.blobs) {
    const blob = new Blob([base64ToBytes(entry.data) as BlobPart], { type: entry.mime });
    blobIdMap.set(entry.id, await storeBlob(blob, entry.name, entry.mime));
  }

  let imported = 0;
  for (const rawDoc of parsed.data.docs) {
    const result = migrateDoc(rawDoc);
    if (!result.ok || !result.doc) {
      const title =
        (rawDoc as { title?: string })?.title ?? (rawDoc as { id?: string })?.id ?? "(untitled)";
      skipped.push({ title, error: result.error ?? "failed validation" });
      continue;
    }

    let doc = remapBlobIds(result.doc, blobIdMap);
    // A document already open under this id must not be silently overwritten.
    if (store.docs[doc.id]) {
      doc = { ...doc, id: `${doc.id}_i${Math.random().toString(36).slice(2, 6)}` } as Doc;
    }
    useWorkspace.getState().addDoc(doc, { open: false });
    imported++;
  }

  if (parsed.data.seedPacketId !== undefined) {
    const seedPacketId = parsed.data.seedPacketId;
    await db.writeMeta("seedPacketId", seedPacketId);
    useWorkspace.setState({ seedPacketId });
  }
  if (parsed.data.seedPacketVersion !== undefined) {
    const seedPacketVersion = parsed.data.seedPacketVersion;
    await db.writeMeta("seedPacketVersion", seedPacketVersion);
    useWorkspace.setState({ seedPacketVersion });
  }

  return { imported, skipped };
}

function remapBlobIds(doc: Doc, map: Map<string, string>): Doc {
  if (map.size === 0) return doc;
  return getSurface(doc.kind).remapBlobIds(doc, map);
}

/* ------------------------------------------------------------------ *
 * File import
 * ------------------------------------------------------------------ */

const PDF_MAGIC = "%PDF-";

/**
 * Imports a dropped or picked file, choosing a surface by content. Returns the
 * new document id, or null when a bundle was imported (which creates many).
 */
export async function importFile(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  const store = useWorkspace.getState();
  const baseTitle = file.name.replace(/\.[^.]+$/, "") || "Imported";

  if (name.endsWith(BUNDLE_EXTENSION) || name.endsWith(".json")) {
    const text = await file.text();
    // A .json file might be a bundle or might be nothing we understand; try the
    // bundle path and fall through to a text document if it is not one.
    try {
      const result = await importBundle(text);
      store.toast(
        result.imported > 0 ? "success" : "error",
        result.imported > 0
          ? `Imported ${result.imported} document${result.imported === 1 ? "" : "s"}.`
          : "Nothing in that bundle could be imported.",
      );
      for (const item of result.skipped) {
        store.toast("error", `Skipped "${item.title}": ${item.error}`);
      }
      return null;
    } catch (err) {
      if (name.endsWith(BUNDLE_EXTENSION)) throw err;
    }
  }

  const header = await file.slice(0, 5).text();
  if (header === PDF_MAGIC || name.endsWith(".pdf")) {
    const blobId = await storeBlob(file, file.name, "application/pdf");
    const doc = createPdfDoc(baseTitle);
    // Page count is filled in by the PDF surface once pdf.js has parsed it.
    const withSource = applyOps<"pdf">(doc, [
      { op: "setSource", blobId, fileName: file.name, pageCount: 0 },
    ]).doc;
    return store.addDoc(withSource);
  }

  if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt") || file.type.startsWith("text/")) {
    const text = await file.text();
    const doc = createTextDoc(baseTitle);
    return store.addDoc({ ...doc, body: markdownToDoc(text) });
  }

  if (formatForFilename(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await importOfficeFile(bytes, file.name);
    const docs = result.docs as Doc[];
    let firstId: string | null = null;
    for (const doc of docs) {
      const id = store.addDoc(doc);
      firstId ??= id;
    }
    const partial = result.warnings.filter((w) => w.severity !== "supported");
    if (partial.length) {
      store.toast(
        "info",
        `Imported with ${partial.length} fidelity warning${partial.length === 1 ? "" : "s"} (not full fidelity).`,
      );
    }
    return firstId;
  }

  throw new Error(
    `Cannot import "${file.name}" — supported: .pdf, .md, .txt, .docx, .odt, .pptx, .odp, .xlsx, .ods, ${BUNDLE_EXTENSION}`,
  );
}

/* ------------------------------------------------------------------ *
 * Download helpers
 * ------------------------------------------------------------------ */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick so the download has committed to the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(base: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = base.replace(/[^\w\-. ]+/g, "").trim() || "workspace";
  return `${safe} ${stamp}${extension}`;
}

/** Validates a single document payload — used when pasting doc JSON. */
export function parseDocPayload(raw: unknown): Doc | null {
  const parsed = DocSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
