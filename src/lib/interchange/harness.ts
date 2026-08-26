import type { Doc, DocKind } from "@/lib/docs/schema";
import { assertGardenCanonical, type FidelityWarning, type InterchangeResult } from "./warnings";

export type OfficeFormat = "docx" | "odt" | "pptx" | "odp" | "xlsx" | "ods";

export interface FormatAdapter {
  format: OfficeFormat;
  kind: DocKind;
  extensions: string[];
  importBytes(bytes: Uint8Array, name: string): Promise<InterchangeResult>;
  exportDoc?(doc: Doc): Promise<{ bytes: Uint8Array; warnings: FidelityWarning[] }>;
}

const adapters = new Map<OfficeFormat, FormatAdapter>();

export function registerFormat(adapter: FormatAdapter): void {
  adapters.set(adapter.format, adapter);
}

export function getFormat(format: OfficeFormat): FormatAdapter | undefined {
  return adapters.get(format);
}

export function allFormats(): OfficeFormat[] {
  return [...adapters.keys()];
}

export function formatForFilename(name: string): OfficeFormat | undefined {
  const lower = name.toLowerCase();
  for (const adapter of adapters.values()) {
    if (adapter.extensions.some((ext) => lower.endsWith(ext))) return adapter.format;
  }
  return undefined;
}

export async function importOfficeFile(
  bytes: Uint8Array,
  name: string,
): Promise<InterchangeResult & { format: OfficeFormat }> {
  const format = formatForFilename(name);
  if (!format) throw new Error(`No interchange adapter for "${name}"`);
  const adapter = adapters.get(format);
  if (!adapter) throw new Error(`Interchange adapter "${format}" is not registered`);
  const result = await adapter.importBytes(bytes, name);
  assertGardenCanonical(result);
  return { ...result, format };
}

export async function exportOffice(
  doc: Doc,
  format: OfficeFormat,
): Promise<{ bytes: Uint8Array; warnings: FidelityWarning[] }> {
  const adapter = getFormat(format);
  if (!adapter) throw new Error(`No interchange adapter for "${format}"`);
  if (!adapter.exportDoc) throw new Error(`No exporter for ${format}`);
  if (adapter.kind !== doc.kind) {
    throw new Error(`Format ${format} expects ${adapter.kind}, got ${doc.kind}`);
  }
  assertGardenCanonical({ docs: [doc], warnings: [] });
  return adapter.exportDoc(doc);
}

export interface FixtureManifest {
  id: string;
  format: OfficeFormat;
  status: "run" | "skip";
  skipReason?: string;
  expectedKind: DocKind;
  expectedContains?: string[];
  warnings?: Pick<FidelityWarning, "code" | "construct" | "severity">[];
  roundTrip?: boolean;
  input?: string;
}

export interface FixtureRun {
  id: string;
  status: "pass" | "skip" | "fail";
  reason?: string;
  warnings: FidelityWarning[];
}

export async function runInterchangeFixture(
  manifest: FixtureManifest,
  bytes: Uint8Array,
  filename: string,
): Promise<FixtureRun> {
  if (manifest.status === "skip") {
    return { id: manifest.id, status: "skip", reason: manifest.skipReason ?? "explicit skip", warnings: [] };
  }
  const adapter = getFormat(manifest.format);
  if (!adapter) {
    return {
      id: manifest.id,
      status: "skip",
      reason: `no importer registered for ${manifest.format}`,
      warnings: [],
    };
  }
  try {
    const result = await importOfficeFile(bytes, filename);
    const docs = result.docs as { kind?: string; body?: unknown }[];
    if (docs.some((doc) => doc.kind !== manifest.expectedKind)) {
      return {
        id: manifest.id,
        status: "fail",
        reason: `expected kind ${manifest.expectedKind}`,
        warnings: result.warnings,
      };
    }
    const blob = JSON.stringify(result.docs);
    for (const needle of manifest.expectedContains ?? []) {
      if (!blob.includes(needle)) {
        return { id: manifest.id, status: "fail", reason: `missing "${needle}"`, warnings: result.warnings };
      }
    }
    if (manifest.roundTrip) {
      const doc = result.docs[0] as Doc;
      if (!adapter.exportDoc) {
        return {
          id: manifest.id,
          status: "fail",
          reason: "roundTrip requested but exporter is missing",
          warnings: result.warnings,
        };
      }
      const exported = await exportOffice(doc, manifest.format);
      const again = await importOfficeFile(exported.bytes, filename);
      const againBlob = JSON.stringify(again.docs);
      for (const needle of manifest.expectedContains ?? []) {
        if (!againBlob.includes(needle)) {
          return {
            id: manifest.id,
            status: "fail",
            reason: `round-trip missing "${needle}"`,
            warnings: again.warnings,
          };
        }
      }
    }
    return { id: manifest.id, status: "pass", warnings: result.warnings };
  } catch (err) {
    return {
      id: manifest.id,
      status: "fail",
      reason: err instanceof Error ? err.message : String(err),
      warnings: [],
    };
  }
}

export function scoreWarnings(warnings: FidelityWarning[]): Record<FidelityWarning["severity"], number> {
  const score = { supported: 0, partial: 0, unsupported: 0 };
  for (const item of warnings) score[item.severity] += 1;
  return score;
}
