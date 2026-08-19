import { z } from "zod";
import {
  type SheetBody,
  type SheetCell,
  CellStylePatchSchema,
  SheetCellSchema,
  SHEET_MAX_COLS,
  SHEET_MAX_ROWS,
} from "@/lib/docs/schema";
import { isRef, parseRef } from "@/lib/sheet/refs";
import { OpError } from "./errors";

/**
 * Sheet operations.
 *
 * Cells hold *raw* strings — a leading `=` is a formula, evaluated at render
 * time, never here (see `lib/sheet/formula`). So every op is a plain data edit
 * with an exact inverse, and the grid recomputes itself after the fact. Empty
 * cells are kept out of the map; an op that clears a cell deletes its key, and
 * the inverse recreates it.
 */
export const SheetOpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("setCell"),
      ref: z.string(),
      value: z.string(),
    })
    .describe('Set one cell\'s raw value by A1 ref (e.g. "B3"); "" clears it. A leading "=" is a formula'),
  z
    .object({
      op: z.literal("setCells"),
      cells: z.record(z.string(), z.string()),
    })
    .describe("Set many cells at once, as a map of A1 ref to raw value — use this to fill a table"),
  z
    .object({
      op: z.literal("setStyle"),
      refs: z.array(z.string()).min(1),
      patch: CellStylePatchSchema,
    })
    .describe("Change bold, italic, align or number format on one or more cells"),
  z
    .object({
      op: z.literal("resize"),
      rows: z.number().int().min(1).max(SHEET_MAX_ROWS).optional(),
      cols: z.number().int().min(1).max(SHEET_MAX_COLS).optional(),
    })
    .describe("Grow or shrink the grid; shrinking drops cells outside the new bounds"),
]);

export type SheetOp = z.infer<typeof SheetOpSchema>;

const DEFAULT_CELL: SheetCell = SheetCellSchema.parse({});

function isBlank(cell: SheetCell): boolean {
  return (
    cell.value === "" &&
    cell.bold === DEFAULT_CELL.bold &&
    cell.italic === DEFAULT_CELL.italic &&
    cell.align === DEFAULT_CELL.align &&
    cell.format === DEFAULT_CELL.format
  );
}

export function applySheetOps(
  body: SheetBody,
  ops: SheetOp[],
): { body: SheetBody; inverse: SheetOp[] } {
  let rows = body.rows;
  let cols = body.cols;
  const cells: Record<string, SheetCell> = { ...body.cells };
  const inverse: SheetOp[] = [];

  const requireInBounds = (ref: string, opName: string): void => {
    const coord = parseRef(ref);
    if (!isRef(ref) || !coord) throw new OpError(`${opName}: "${ref}" is not a cell reference`);
    if (coord.row >= rows || coord.col >= cols) {
      throw new OpError(`${opName}: "${ref}" is outside the ${rows}×${cols} grid`);
    }
  };

  // Write a raw value into a cell, preserving its style, and keep the map sparse
  // by deleting cells that end up blank.
  const writeValue = (ref: string, value: string): void => {
    const prior = cells[ref] ?? DEFAULT_CELL;
    const next: SheetCell = { ...prior, value };
    if (isBlank(next)) delete cells[ref];
    else cells[ref] = next;
  };

  for (const op of ops) {
    switch (op.op) {
      case "setCell": {
        requireInBounds(op.ref, "setCell");
        inverse.push({ op: "setCell", ref: op.ref, value: cells[op.ref]?.value ?? "" });
        writeValue(op.ref, op.value);
        break;
      }

      case "setCells": {
        const prior: Record<string, string> = {};
        for (const [ref, value] of Object.entries(op.cells)) {
          requireInBounds(ref, "setCells");
          prior[ref] = cells[ref]?.value ?? "";
          writeValue(ref, value);
        }
        if (Object.keys(prior).length > 0) inverse.push({ op: "setCells", cells: prior });
        break;
      }

      case "setStyle": {
        const keys = Object.keys(op.patch) as (keyof typeof op.patch)[];
        if (keys.length === 0) break;
        for (const ref of op.refs) {
          requireInBounds(ref, "setStyle");
          const prior = cells[ref] ?? DEFAULT_CELL;
          const priorPatch: Record<string, unknown> = {};
          for (const key of keys) priorPatch[key] = prior[key];
          const next: SheetCell = SheetCellSchema.parse({ ...prior, ...op.patch });
          if (isBlank(next)) delete cells[ref];
          else cells[ref] = next;
          // One inverse op per ref: each may have had a different prior style.
          inverse.push({ op: "setStyle", refs: [ref], patch: priorPatch });
        }
        break;
      }

      case "resize": {
        const nextRows = op.rows ?? rows;
        const nextCols = op.cols ?? cols;
        if (nextRows === rows && nextCols === cols) break;

        // Capture cells that fall outside the new bounds so a shrink is reversible.
        const dropped: Record<string, string> = {};
        if (nextRows < rows || nextCols < cols) {
          for (const [ref, cell] of Object.entries(cells)) {
            const coord = parseRef(ref);
            if (coord && (coord.row >= nextRows || coord.col >= nextCols)) {
              dropped[ref] = cell.value;
              delete cells[ref];
            }
          }
        }

        // Pushed in collection order; the final `reverse()` makes the grow-back
        // run before the dropped cells are restored into it.
        if (Object.keys(dropped).length > 0) inverse.push({ op: "setCells", cells: dropped });
        inverse.push({ op: "resize", rows, cols });

        rows = nextRows;
        cols = nextCols;
        break;
      }
    }
  }

  return { body: { rows, cols, cells, columnWidths: body.columnWidths }, inverse: inverse.reverse() };
}
