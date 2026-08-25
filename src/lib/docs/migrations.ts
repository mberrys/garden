import { DocSchema, type Doc, SCHEMA_VERSION } from "./schema";
import { upgradeLegacyGardenRef } from "@/lib/refs/resolve";

/**
 * Forward migrations for persisted documents.
 *
 * Documents live in the user's browser indefinitely, so a schema change must
 * never orphan them. Each entry upgrades a document from version N to N+1;
 * `migrateDoc` runs the chain and then validates against the current schema.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

function upgradeGardenRefCells(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.kind !== "database") return { ...raw, schemaVersion: 2 };
  const body = raw.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ...raw, schemaVersion: 2 };
  }
  const rows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return { ...raw, schemaVersion: 2 };

  const nextRows = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const cells = (row as { cells?: unknown }).cells;
    if (!cells || typeof cells !== "object" || Array.isArray(cells)) return row;
    const nextCells: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cells as Record<string, unknown>)) {
      if (value && typeof value === "object" && !Array.isArray(value) && "documentId" in value) {
        nextCells[key] = upgradeLegacyGardenRef(value);
      } else {
        nextCells[key] = value;
      }
    }
    return { ...row, cells: nextCells };
  });

  const views = (body as { views?: unknown }).views;
  const nextViews = Array.isArray(views)
    ? views.map((view) => {
        if (!view || typeof view !== "object" || Array.isArray(view)) return view;
        const typed = view as Record<string, unknown>;
        if (!("filters" in typed)) return { ...typed, filters: [] };
        return typed;
      })
    : views;

  return {
    ...raw,
    schemaVersion: 2,
    body: { ...(body as Record<string, unknown>), rows: nextRows, views: nextViews },
  };
}

export const MIGRATIONS: Record<number, Migration> = {
  1: upgradeGardenRefCells,
};

export interface MigrationResult {
  ok: boolean;
  doc?: Doc;
  error?: string;
}

export function migrateDoc(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "document is not an object" };
  }

  let current = { ...(raw as Record<string, unknown>) };
  let version = typeof current.schemaVersion === "number" ? current.schemaVersion : 1;

  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `document schema v${version} is newer than this build (v${SCHEMA_VERSION}); update the app`,
    };
  }

  let guard = 0;
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: `no migration from schema v${version}` };
    current = migrate(current);
    version = typeof current.schemaVersion === "number" ? current.schemaVersion : version + 1;
    if (++guard > 64) return { ok: false, error: "migration chain did not terminate" };
  }

  const parsed = DocSchema.safeParse(current);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { ok: true, doc: parsed.data };
}
