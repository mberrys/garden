import { Table2 } from "lucide-react";
import type { DatabaseDoc, DatabaseField } from "@/lib/docs/schema";
import { DatabaseOpSchema, applyDatabaseOps } from "@/lib/ops/database";
import { createDatabaseDoc } from "@/lib/docs/factories";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeDatabase(doc: DatabaseDoc, selection?: SurfaceSelection): string {
  const { fields, rows, views, activeViewId } = doc.body;
  const parts = [
    `Database "${doc.title}" — ${fields.length} field(s), ${rows.length} row(s), ${views.length} view(s).`,
    `Active view: ${activeViewId ?? "(none)"}`,
    "\nFields:",
    ...fields.map((f) => fieldLine(f)),
  ];

  if (rows.length === 0) {
    parts.push("\n(no rows)");
    return parts.join("\n");
  }

  parts.push("\nRows:");
  for (const row of rows.slice(0, 80)) {
    const cellParts = fields.map((f) => {
      const v = row.cells[f.id];
      if (v === undefined || v === null) return `${f.id}=`;
      if (Array.isArray(v)) return `${f.id}=[${v.join(",")}]`;
      if (typeof v === "object") return `${f.id}=${JSON.stringify(v)}`;
      return `${f.id}=${String(v)}`;
    });
    parts.push(`  row ${row.id}: ${cellParts.join(" ")}`);
  }
  if (rows.length > 80) parts.push(`  …${rows.length - 80} more rows`);

  if (selection?.kind === "database" && selection.rowId) {
    parts.push(`\nUser selected row ${selection.rowId}`);
  }

  return parts.join("\n");
}

function fieldLine(field: DatabaseField): string {
  switch (field.type) {
    case "relation":
      return `  ${field.id} ${field.name} relation -> ${field.targetDocId}`;
    case "select":
    case "multi_select":
      return `  ${field.id} ${field.name} ${field.type} [${field.options.join(", ")}]`;
    case "text":
    case "number":
    case "date":
    case "checkbox":
    case "url":
    case "file":
    case "garden_ref":
    case "external_ref":
      return `  ${field.id} ${field.name} ${field.type}`;
    default: {
      const _exhaustive: never = field;
      return `  ${JSON.stringify(_exhaustive)}`;
    }
  }
}

function describeDatabaseSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "database") return null;
  return selection.rowId
    ? `The user selected row ${selection.rowId}${
        selection.fieldId ? `, field ${selection.fieldId}` : ""
      }`
    : null;
}

function mockDatabase(request: MockRequest): string {
  const doc = request.doc as DatabaseDoc;
  const ask = request.request.toLowerCase();
  const nameField = doc.body.fields.find((f) => f.type === "text");

  if (/add|row|insert/.test(ask)) {
    const cells: Record<string, unknown> = {};
    if (nameField) cells[nameField.id] = "New row (scripted)";
    return block("Added a row to the database.", [{ op: "addRow", row: { cells } }]);
  }
  if (/field|column|schema/.test(ask)) {
    return block("Added a notes field.", [
      { op: "addField", field: { type: "text", name: "Notes" } },
    ]);
  }
  const rowId = doc.body.rows[0]?.id;
  const fieldId = nameField?.id ?? doc.body.fields[0]?.id;
  if (!rowId || !fieldId) {
    return block("This database has no rows to update yet.", []);
  }
  return block("Updated the first row's primary text field.", [
    { op: "setCell", rowId, fieldId, value: "Updated by scripted provider" },
  ]);
}

function describeDatabaseOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "addField":
      return `Add ${(op.field as { type?: string } | undefined)?.type ?? "typed"} field`;
    case "updateField":
      return `Update field ${op.id} (${Object.keys((op.patch as Record<string, unknown>) ?? {}).join(", ")})`;
    case "deleteField":
      return `Delete field ${op.id}`;
    case "reorderField":
      return `Move field ${op.id} to position ${op.toIndex}`;
    case "addRow":
      return `Add row`;
    case "updateRow":
      return `Update row ${op.id}`;
    case "deleteRow":
      return `Delete row ${op.id}`;
    case "reorderRow":
      return `Move row ${op.id} to position ${op.toIndex}`;
    case "setCell":
      if (typeof op.rowId !== "string" || typeof op.fieldId !== "string") return undefined;
      return `Set cell on row ${op.rowId}`;
    case "linkRelation":
      return `Link ${((op.targetRowIds as unknown[]) ?? []).length} row(s) on ${op.rowId}`;
    case "unlinkRelation":
      return `Unlink row(s) on ${op.rowId}`;
    case "addView":
      return `Add ${(op.view as { type?: string } | undefined)?.type ?? "typed"} view`;
    case "updateView":
      return `Update view ${op.id}`;
    case "deleteView":
      return `Delete view ${op.id}`;
    case "setActiveView":
      return `Switch to view ${op.id ?? "none"}`;
    default:
      return undefined;
  }
}

registerSurface({
  kind: "database",
  label: "Database",
  icon: Table2,
  iconColor: "#ec4899",
  opSchema: DatabaseOpSchema,
  applyOps: applyDatabaseOps,
  createDoc: createDatabaseDoc,
  ownsHistory: false,
  contextBudget: 10_000,
  promptNotes:
    "Rows are addressed by row id. Fields are addressed by field id. Relation cells hold " +
    "arrays of linked row ids from the target database. Keep observed/imported facts separate " +
    "from interpretive fields.",
  serializeDoc: serializeDatabase,
  describeSelection: describeDatabaseSelection,
  mockReply: mockDatabase,
  describeOp: describeDatabaseOp,
  // File cells can hold blob ids; collecting/remapping them is F01 provenance work.
  referencedBlobIds: () => new Set(),
  remapBlobIds: (doc) => doc,
  adapter: {
    engine: "garden",
    status: "not-required",
    userEdits: "grid and inspector commit addRow/setCell/linkRelation ops from Garden-owned controls",
    gardenUpdates: "React grid/kanban/inspector re-render from DatabaseBody",
    selection: "selected row + field, pushed to the workspace store",
    notes: "Garden-owned structured base. No borrowed engine planned. garden_ref/external_ref stay Bases-local until F01.",
  },
  loadComponent: () => import("@/surfaces/database/database-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}
