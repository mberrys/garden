import type {
  DatabaseBody,
  DatabaseDoc,
  DatabaseField,
  DatabaseRow,
  DatabaseView,
} from "@/lib/docs/schema";
import { createDatabaseDoc } from "@/lib/docs/factories";
import { newRowId } from "@/lib/docs/ids";
import type { DatabaseSeed, LinkSeed } from "./types";

/**
 * Builds a database document from a packet seed. Relation targetDocIds and link
 * cells are filled later during sprout once local ids resolve to document ids.
 */
export function databaseFromSeed(
  seed: DatabaseSeed,
  targetDocIds: Map<string, string>,
): DatabaseDoc {
  const doc = createDatabaseDoc(seed.title);

  const fields: DatabaseField[] = seed.fields.map((field) => {
    if (field.type === "relation") {
      const targetDocId = targetDocIds.get(field.targetLocalId);
      if (!targetDocId) {
        throw new Error(
          `Database seed "${seed.localId}" relation field "${field.id}" has unresolved target "${field.targetLocalId}".`,
        );
      }
      return {
        id: field.id,
        name: field.name,
        type: "relation",
        targetDocId,
      };
    }
    return field as DatabaseField;
  });

  const views: DatabaseView[] = seed.views.map((view) => {
    if (view.type === "grid") {
      return {
        id: view.id,
        name: view.name,
        type: "grid",
        hiddenFieldIds: view.hiddenFieldIds ?? [],
        sortFieldId: view.sortFieldId ?? null,
        sortDirection: view.sortDirection ?? "asc",
      };
    }
    return {
      id: view.id,
      name: view.name,
      type: "kanban",
      groupFieldId: view.groupFieldId,
    };
  });

  const rows: DatabaseRow[] = (seed.rows ?? []).map((rowSeed) => {
    const id = newRowId();
    return { id, cells: { ...rowSeed.cells } };
  });

  const activeViewId =
    seed.activeViewId && views.some((v) => v.id === seed.activeViewId)
      ? seed.activeViewId
      : (views[0]?.id ?? null);

  const body: DatabaseBody = {
    fields,
    rows,
    views,
    activeViewId,
  };

  return { ...doc, body };
}

export function applyLinkSeeds(
  docs: DatabaseDoc[],
  localToId: Map<string, string>,
  rowLocalToId: Map<string, string>,
  links: LinkSeed[],
): DatabaseDoc[] {
  const result = docs.map((d) => ({
    ...d,
    body: {
      ...d.body,
      rows: d.body.rows.map((r) => ({ ...r, cells: { ...r.cells } })),
    },
  }));

  const rowToDoc = new Map<string, DatabaseDoc>();
  for (const doc of result) {
    for (const row of doc.body.rows) {
      rowToDoc.set(row.id, doc);
    }
  }

  for (const link of links) {
    const rowId = rowLocalToId.get(link.rowLocalId);
    if (!rowId) continue;

    const doc = rowToDoc.get(rowId);
    if (!doc) continue;

    const row = doc.body.rows.find((r) => r.id === rowId);
    if (!row) continue;

    if (link.kind === "relation") {
      const targetIds = link.targetRowLocalIds
        .map((lid) => rowLocalToId.get(lid))
        .filter((id): id is string => Boolean(id));
      row.cells[link.fieldId] = targetIds;
    } else if (link.kind === "garden_ref") {
      const documentId = localToId.get(link.targetLocalId);
      if (!documentId) continue;
      row.cells[link.fieldId] = {
        documentId,
        objectId: link.objectId,
      };
    } else {
      const _exhaustive: never = link;
      throw new Error(`Unknown link kind: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return result;
}
