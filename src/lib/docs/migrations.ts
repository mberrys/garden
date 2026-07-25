import { type Doc, DocSchema, SCHEMA_VERSION } from "./schema";

/**
 * Forward migrations for persisted documents.
 *
 * Documents live in the user's browser indefinitely, so a schema change must
 * never orphan them. Each entry upgrades a document from version N to N+1;
 * `migrateDoc` runs the chain and then validates against the current schema.
 *
 * There is exactly one version so far, so the table is empty — it exists as the
 * seam, and the test suite asserts the chain covers every version below current.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {
  // 1: (raw) => ({ ...raw, schemaVersion: 2, /* ... */ }),
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
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, doc: parsed.data };
}
