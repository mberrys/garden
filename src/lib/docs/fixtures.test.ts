import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDoc } from "./migrations";
import { SCHEMA_VERSION } from "./schema";
import { isGardenRef } from "@/lib/refs/schema";

function loadFixture(name: string): { docs: unknown[] } {
  const raw = readFileSync(join(process.cwd(), "fixtures", "gardenspace", name), "utf8");
  return JSON.parse(raw) as { docs: unknown[] };
}

describe("frozen .gardenspace fixtures", () => {
  it("migrates the v1 four-surface snapshot", () => {
    const bundle = loadFixture("v1-four-surfaces.gardenspace");
    expect(bundle.docs).toHaveLength(4);
    for (const raw of bundle.docs) {
      const result = migrateDoc(raw);
      expect(result.ok, result.error).toBe(true);
      expect(result.doc?.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });

  it("lifts a pre-version garden_ref cell and keeps the same document id", () => {
    const bundle = loadFixture("v1-database-legacy-ref.gardenspace");
    const dbRaw = bundle.docs.find((doc) => (doc as { kind?: string }).kind === "database");
    const result = migrateDoc(dbRaw);
    expect(result.ok, result.error).toBe(true);
    if (!result.doc || result.doc.kind !== "database") return;
    const cell = result.doc.body.rows[0]?.cells.fld_ref;
    expect(isGardenRef(cell)).toBe(true);
    if (isGardenRef(cell)) {
      expect(cell.version).toBe(1);
      expect(cell.documentId).toBe("doc_v1_src");
    }
  });
});
