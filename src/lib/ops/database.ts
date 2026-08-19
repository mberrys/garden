import { z } from "zod";
import {
  type DatabaseBody,
  type DatabaseField,
  type DatabaseRow,
  type DatabaseView,
  DatabaseFieldSchema,
  DatabaseViewSchema,
  CellValueSchema,
  type CellValue,
} from "@/lib/docs/schema";
import { newFieldId, newRowId, newViewId } from "@/lib/docs/ids";
import { OpError } from "./errors";

const FieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "checkbox",
  "url",
  "relation",
  "file",
  "garden_ref",
  "external_ref",
]);

export const DatabaseOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("addField"),
      field: z.object({ type: FieldTypeSchema }).catchall(z.unknown()),
      index: z.number().int().min(0).optional(),
    })
    .describe("Add a typed field to the database schema"),
  z
    .object({
      op: z.literal("updateField"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Update field metadata (name, options, targetDocId)"),
  z
    .object({ op: z.literal("deleteField"), id: z.string() })
    .describe("Remove a field and its cell values"),
  z
    .object({
      op: z.literal("reorderField"),
      id: z.string(),
      toIndex: z.number().int().min(0),
    })
    .describe("Move a field in the schema order"),
  z
    .object({
      op: z.literal("addRow"),
      row: z
        .object({
          id: z.string().optional(),
          cells: z.record(z.string(), CellValueSchema).optional(),
        })
        .optional(),
      index: z.number().int().min(0).optional(),
    })
    .describe("Add a row with optional initial cells"),
  z
    .object({
      op: z.literal("updateRow"),
      id: z.string(),
      patch: z.object({ cells: z.record(z.string(), CellValueSchema).optional() }),
    })
    .describe("Patch row cells"),
  z
    .object({ op: z.literal("deleteRow"), id: z.string() })
    .describe("Delete a row"),
  z
    .object({
      op: z.literal("reorderRow"),
      id: z.string(),
      toIndex: z.number().int().min(0),
    })
    .describe("Move a row in list order"),
  z
    .object({
      op: z.literal("setCell"),
      rowId: z.string(),
      fieldId: z.string(),
      value: CellValueSchema,
    })
    .describe("Set one cell value"),
  z
    .object({
      op: z.literal("linkRelation"),
      rowId: z.string(),
      fieldId: z.string(),
      targetRowIds: z.array(z.string()),
    })
    .describe("Set relation cell to linked row ids"),
  z
    .object({
      op: z.literal("unlinkRelation"),
      rowId: z.string(),
      fieldId: z.string(),
      targetRowIds: z.array(z.string()),
    })
    .describe("Remove specific links from a relation cell"),
  z
    .object({
      op: z.literal("addView"),
      view: z.object({ type: z.enum(["grid", "kanban"]) }).catchall(z.unknown()),
    })
    .describe("Add a grid or kanban view"),
  z
    .object({
      op: z.literal("updateView"),
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    })
    .describe("Update view settings"),
  z
    .object({ op: z.literal("deleteView"), id: z.string() })
    .describe("Delete a view"),
  z
    .object({ op: z.literal("setActiveView"), id: z.string().nullable() })
    .describe("Switch the active view"),
]);

export type DatabaseOp = z.infer<typeof DatabaseOpSchema>;

function writeCell(row: DatabaseRow, fieldId: string, value: CellValue | null): void {
  if (value === null) delete row.cells[fieldId];
  else row.cells[fieldId] = value;
}

function parseField(spec: { type: DatabaseField["type"] } & Record<string, unknown>): DatabaseField {
  const withId = { id: newFieldId(), name: "Field", ...spec };
  const parsed = DatabaseFieldSchema.safeParse(withId);
  if (!parsed.success) {
    throw new OpError(`addField: ${parsed.error.message}`);
  }
  return parsed.data;
}

function parseView(spec: { type: DatabaseView["type"] } & Record<string, unknown>): DatabaseView {
  const withId = { id: newViewId(), name: "View", ...spec };
  const parsed = DatabaseViewSchema.safeParse(withId);
  if (!parsed.success) {
    throw new OpError(`addView: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function applyDatabaseOps(
  body: DatabaseBody,
  ops: DatabaseOp[],
): { body: DatabaseBody; inverse: DatabaseOp[] } {
  let fields = body.fields.slice();
  let rows = body.rows.map((r) => ({ ...r, cells: { ...r.cells } }));
  let views = body.views.slice();
  let activeViewId = body.activeViewId;
  const inverse: DatabaseOp[] = [];

  for (const op of ops) {
    switch (op.op) {
      case "addField": {
        const field = parseField(op.field as { type: DatabaseField["type"] } & Record<string, unknown>);
        const at = op.index === undefined ? fields.length : Math.min(op.index, fields.length);
        fields.splice(at, 0, field);
        inverse.push({ op: "deleteField", id: field.id });
        break;
      }

      case "updateField": {
        const index = fields.findIndex((f) => f.id === op.id);
        if (index === -1) throw new OpError(`updateField: no field "${op.id}"`);
        const before = fields[index];
        if ("type" in op.patch && op.patch.type !== before.type) {
          throw new OpError(`updateField: cannot change type of "${op.id}"`);
        }
        const merged = { ...before, ...op.patch, type: before.type, id: before.id };
        const parsed = DatabaseFieldSchema.safeParse(merged);
        if (!parsed.success) throw new OpError(`updateField: ${parsed.error.message}`);
        const prior: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          prior[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateField", id: op.id, patch: prior });
        fields = fields.slice();
        fields[index] = parsed.data;
        break;
      }

      case "deleteField": {
        const index = fields.findIndex((f) => f.id === op.id);
        if (index === -1) throw new OpError(`deleteField: no field "${op.id}"`);
        const [removed] = fields.splice(index, 1);
        inverse.push({
          op: "addField",
          field: removed as unknown as { type: DatabaseField["type"] } & Record<string, unknown>,
          index,
        });
        rows = rows.map((row) => {
          const cells = { ...row.cells };
          delete cells[op.id];
          return { ...row, cells };
        });
        break;
      }

      case "reorderField": {
        const from = fields.findIndex((f) => f.id === op.id);
        if (from === -1) throw new OpError(`reorderField: no field "${op.id}"`);
        const to = Math.min(op.toIndex, fields.length - 1);
        const [moved] = fields.splice(from, 1);
        fields.splice(to, 0, moved);
        inverse.push({ op: "reorderField", id: op.id, toIndex: from });
        break;
      }

      case "addRow": {
        const row: DatabaseRow = {
          id: op.row?.id ?? newRowId(),
          cells: op.row?.cells ?? {},
        };
        const at = op.index === undefined ? rows.length : Math.min(op.index, rows.length);
        rows.splice(at, 0, row);
        inverse.push({ op: "deleteRow", id: row.id });
        break;
      }

      case "updateRow": {
        const index = rows.findIndex((r) => r.id === op.id);
        if (index === -1) throw new OpError(`updateRow: no row "${op.id}"`);
        const before = rows[index];
        const priorCells: Record<string, CellValue> = {};
        if (op.patch.cells) {
          for (const key of Object.keys(op.patch.cells)) {
            const prior = before.cells[key];
            priorCells[key] = prior === undefined ? null : prior;
          }
        }
        inverse.push({ op: "updateRow", id: op.id, patch: { cells: priorCells } });
        rows = rows.slice();
        rows[index] = {
          ...before,
          cells: { ...before.cells, ...op.patch.cells },
        };
        break;
      }

      case "deleteRow": {
        const index = rows.findIndex((r) => r.id === op.id);
        if (index === -1) throw new OpError(`deleteRow: no row "${op.id}"`);
        const [removed] = rows.splice(index, 1);
        inverse.push({
          op: "addRow",
          row: { id: removed.id, cells: removed.cells },
          index,
        });
        break;
      }

      case "reorderRow": {
        const from = rows.findIndex((r) => r.id === op.id);
        if (from === -1) throw new OpError(`reorderRow: no row "${op.id}"`);
        const to = Math.min(op.toIndex, rows.length - 1);
        const [moved] = rows.splice(from, 1);
        rows.splice(to, 0, moved);
        inverse.push({ op: "reorderRow", id: op.id, toIndex: from });
        break;
      }

      case "setCell": {
        const row = rows.find((r) => r.id === op.rowId);
        if (!row) throw new OpError(`setCell: no row "${op.rowId}"`);
        const hadKey = op.fieldId in row.cells;
        const prior = row.cells[op.fieldId];
        inverse.push({
          op: "setCell",
          rowId: op.rowId,
          fieldId: op.fieldId,
          value: hadKey ? prior : null,
        });
        writeCell(row, op.fieldId, op.value);
        break;
      }

      case "linkRelation": {
        const row = rows.find((r) => r.id === op.rowId);
        if (!row) throw new OpError(`linkRelation: no row "${op.rowId}"`);
        const prior = row.cells[op.fieldId];
        const current = Array.isArray(prior) ? (prior as string[]) : [];
        const next = [...new Set([...current, ...op.targetRowIds])];
        inverse.push({
          op: "setCell",
          rowId: op.rowId,
          fieldId: op.fieldId,
          value: op.fieldId in row.cells ? prior : null,
        });
        row.cells[op.fieldId] = next;
        break;
      }

      case "unlinkRelation": {
        const row = rows.find((r) => r.id === op.rowId);
        if (!row) throw new OpError(`unlinkRelation: no row "${op.rowId}"`);
        const prior = row.cells[op.fieldId];
        const current = Array.isArray(prior) ? (prior as string[]) : [];
        const next = current.filter((id) => !op.targetRowIds.includes(id));
        inverse.push({
          op: "setCell",
          rowId: op.rowId,
          fieldId: op.fieldId,
          value: op.fieldId in row.cells ? prior : null,
        });
        if (next.length === 0) delete row.cells[op.fieldId];
        else row.cells[op.fieldId] = next;
        break;
      }

      case "addView": {
        const view = parseView(op.view as { type: DatabaseView["type"] } & Record<string, unknown>);
        views.push(view);
        inverse.push({ op: "deleteView", id: view.id });
        break;
      }

      case "updateView": {
        const index = views.findIndex((v) => v.id === op.id);
        if (index === -1) throw new OpError(`updateView: no view "${op.id}"`);
        const before = views[index];
        if ("type" in op.patch && op.patch.type !== before.type) {
          throw new OpError(`updateView: cannot change type of "${op.id}"`);
        }
        const merged = { ...before, ...op.patch, type: before.type, id: before.id };
        const parsed = DatabaseViewSchema.safeParse(merged);
        if (!parsed.success) throw new OpError(`updateView: ${parsed.error.message}`);
        const prior: Record<string, unknown> = {};
        for (const key of Object.keys(op.patch)) {
          prior[key] = (before as unknown as Record<string, unknown>)[key];
        }
        inverse.push({ op: "updateView", id: op.id, patch: prior });
        views = views.slice();
        views[index] = parsed.data;
        break;
      }

      case "deleteView": {
        const index = views.findIndex((v) => v.id === op.id);
        if (index === -1) throw new OpError(`deleteView: no view "${op.id}"`);
        const [removed] = views.splice(index, 1);
        if (activeViewId === op.id) {
          activeViewId = views[0]?.id ?? null;
        }
        inverse.push({
          op: "addView",
          view: removed as unknown as { type: DatabaseView["type"] } & Record<string, unknown>,
        });
        break;
      }

      case "setActiveView": {
        inverse.push({ op: "setActiveView", id: activeViewId });
        activeViewId = op.id;
        break;
      }

      default: {
        const _exhaustive: never = op;
        throw new OpError(`unknown database op: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return {
    body: { fields, rows, views, activeViewId },
    inverse: inverse.reverse(),
  };
}
