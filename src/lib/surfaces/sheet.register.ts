import { Table } from "lucide-react";
import type { Doc, SheetDoc } from "@/lib/docs/schema";
import { SheetOpSchema, applySheetOps } from "@/lib/ops/sheet";
import { createSheetDoc } from "@/lib/docs/factories";
import { docToMarkdown } from "@/lib/text/markdown";
import { indexToCol, parseRef, toRef } from "@/lib/sheet/refs";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeSheet(doc: SheetDoc): string {
  const { rows, cols, cells } = doc.body;
  const header = `Sheet "${doc.title}", ${rows} rows × ${cols} columns. Cells hold raw values; a leading "=" is a formula.`;

  const refs = Object.keys(cells);
  if (refs.length === 0) {
    return `${header}\n(the grid is empty)`;
  }

  // Only render the populated region, so an empty 20×8 grid costs nothing.
  let maxRow = 0;
  let maxCol = 0;
  for (const ref of refs) {
    const coord = parseRef(ref);
    if (!coord) continue;
    maxRow = Math.max(maxRow, coord.row);
    maxCol = Math.max(maxCol, coord.col);
  }
  maxRow = Math.min(maxRow, rows - 1);
  maxCol = Math.min(maxCol, cols - 1);

  const headerCells = ["   "];
  for (let c = 0; c <= maxCol; c++) headerCells.push(indexToCol(c));
  const lines = [`| ${headerCells.join(" | ")} |`];

  for (let r = 0; r <= maxRow; r++) {
    const rowCells = [String(r + 1)];
    for (let c = 0; c <= maxCol; c++) {
      const cell = cells[toRef({ row: r, col: c })];
      rowCells.push(cell ? cell.value.replace(/\|/g, "\\|") : "");
    }
    lines.push(`| ${rowCells.join(" | ")} |`);
  }

  return `${header}\n\n${lines.join("\n")}`;
}

function describeSheetSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "sheet") return null;
  if (selection.range) return `The user has selected the range ${selection.range}`;
  return selection.cell ? `The user has selected cell ${selection.cell}` : null;
}

function mockSheet(request: MockRequest): string {
  const doc = request.doc as SheetDoc;
  const ask = request.request.toLowerCase();
  const source = request.companions?.[0]?.doc;

  // Cross-surface: extract a table from a companion document.
  if (source) {
    const rows = sourceHighlights(source);
    const cells: Record<string, string> = { A1: "Point", B1: "Detail" };
    rows.forEach((line, i) => {
      cells[`A${i + 2}`] = `Item ${i + 1}`;
      cells[`B${i + 2}`] = truncate(line, 60);
    });
    return block(`Extracted a ${rows.length}-row table from "${source.title}".`, [
      { op: "setCells", cells },
    ]);
  }

  if (/total|sum|average|subtotal/.test(ask)) {
    // Total the numbers already in column A, if any.
    let last = -1;
    for (const [ref, cell] of Object.entries(doc.body.cells)) {
      const coord = parseRef(ref);
      if (coord && coord.col === 0 && /^[+-]?[\d.]+$/.test(cell.value.trim())) {
        last = Math.max(last, coord.row);
      }
    }
    if (last >= 0 && last + 2 <= doc.body.rows) {
      return block("Added a total under column A.", [
        { op: "setCell", ref: `A${last + 2}`, value: `=SUM(A1:A${last + 1})` },
      ]);
    }
    return block("Filled a short column and totalled it.", [
      { op: "setCells", cells: { A1: "10", A2: "20", A3: "30", A4: "=SUM(A1:A3)" } },
    ]);
  }

  if (/fill|table|data|populate|sample|example/.test(ask)) {
    return block("Filled a sample table with a formula column.", [
      {
        op: "setCells",
        cells: {
          A1: "Quarter",
          B1: "Revenue",
          C1: "Share",
          A2: "Q1",
          B2: "120",
          C2: "=B2/B4",
          A3: "Q2",
          B3: "150",
          C3: "=B3/B4",
          A4: "Total",
          B4: "=SUM(B2:B3)",
        },
      },
    ]);
  }

  return block("Set a cell — start a local model for real spreadsheet edits.", [
    { op: "setCell", ref: "A1", value: "Edited by the mock provider" },
  ]);
}

function describeSheetOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "setCell":
      return (op.value as string).trim() === ""
        ? `Clear cell ${op.ref}`
        : `Set ${op.ref} to ${preview(op.value as string)}`;
    case "setCells": {
      const n = Object.keys(op.cells as Record<string, unknown>).length;
      return `Set ${n} cell${plural(n)}`;
    }
    case "setStyle":
      return `Style ${(op.refs as unknown[]).length} cell${plural((op.refs as unknown[]).length)} (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    case "resize": {
      const parts: string[] = [];
      if (op.rows !== undefined) parts.push(`${op.rows} rows`);
      if (op.cols !== undefined) parts.push(`${op.cols} columns`);
      return `Resize sheet${parts.length ? ` to ${parts.join(" × ")}` : ""}`;
    }
    default:
      return undefined;
  }
}

registerSurface({
  kind: "sheet",
  label: "Sheet",
  icon: Table,
  iconColor: "#10b981",
  opSchema: SheetOpSchema,
  applyOps: applySheetOps,
  createDoc: createSheetDoc,
  ownsHistory: false,
  contextBudget: 10_000,
  promptNotes:
    "Cells are addressed in A1 notation: a column letter then a 1-based row number (A1, " +
    "B3). Set values with setCell, or fill a whole table at once with setCells (a map of " +
    "ref to raw value). A value beginning with = is a formula — you may use + - * / ^, " +
    "parentheses, ranges like A1:B3, and SUM, AVERAGE, MIN, MAX, COUNT, IF, ROUND, ABS and " +
    "CONCAT. Reference only cells inside the grid's row/column bounds; grow it first with " +
    "resize if you need more room.",
  serializeDoc: serializeSheet,
  describeSelection: describeSheetSelection,
  mockReply: mockSheet,
  describeOp: describeSheetOp,
  referencedBlobIds: () => new Set(),
  remapBlobIds: (doc) => doc,
  loadComponent: () => import("@/surfaces/sheet/sheet-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}

function preview(md: string): string {
  const flat = md.replace(/\s+/g, " ").trim();
  return `"${truncate(flat, 60)}"`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}

function sourceHighlights(source: Doc): string[] {
  if (source.kind === "text") {
    const markdown = docToMarkdown(source.body);
    const lines = markdown
      .split("\n")
      .map((l) => l.replace(/^[#>\-*\d.]+\s*/, "").trim())
      .filter((l) => l.length > 20);
    if (lines.length) return lines.slice(0, 4).map((l) => truncate(l, 90));
  }
  if (source.kind === "pdf") {
    const pages = Object.values(source.body.pageText).filter(Boolean);
    if (pages.length) {
      return pages
        .slice(0, 4)
        .map((page) => truncate(page.replace(/\s+/g, " ").trim(), 90))
        .filter(Boolean);
    }
  }
  return ["First point", "Second point", "Third point"];
}
