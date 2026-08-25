import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FixtureManifest, OfficeFormat } from "./harness";
import { runInterchangeFixture, type FixtureRun } from "./harness";

const FORMATS: OfficeFormat[] = ["docx", "odt", "pptx", "odp", "xlsx", "ods"];

export function interchangeCorpusRoot(): string {
  return fileURLToPath(new URL("../../../fixtures/interchange", import.meta.url));
}

export interface LoadedFixture {
  dir: string;
  manifest: FixtureManifest;
  bytes: Uint8Array;
  filename: string;
}

export function loadInterchangeCorpus(root = interchangeCorpusRoot()): LoadedFixture[] {
  const loaded: LoadedFixture[] = [];
  for (const format of FORMATS) {
    const formatDir = join(root, format);
    if (!existsSync(formatDir)) continue;
    for (const id of readdirSync(formatDir)) {
      const dir = join(formatDir, id);
      const manifestPath = join(dir, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FixtureManifest;
      const inputName = manifest.input ?? `input.${format}`;
      const inputPath = join(dir, inputName);
      const bytes = existsSync(inputPath) ? new Uint8Array(readFileSync(inputPath)) : new Uint8Array();
      loaded.push({ dir, manifest, bytes, filename: inputName });
    }
  }
  return loaded;
}

export async function runInterchangeCorpus(root = interchangeCorpusRoot()): Promise<FixtureRun[]> {
  const fixtures = loadInterchangeCorpus(root);
  const runs: FixtureRun[] = [];
  for (const fixture of fixtures) {
    runs.push(await runInterchangeFixture(fixture.manifest, fixture.bytes, fixture.filename));
  }
  return runs;
}
