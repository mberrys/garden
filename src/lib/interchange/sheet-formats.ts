import ExcelJS from "exceljs";
import type { SheetCell, SheetDoc } from "@/lib/docs/schema";
import { SHEET_MAX_COLS, SHEET_MAX_ROWS } from "@/lib/docs/schema";
import { createSheetDoc } from "@/lib/docs/factories";
import { parseRef } from "@/lib/sheet/refs";
import { registerFormat } from "./harness";
import { warning, type InterchangeResult } from "./warnings";
import { buildOdsPackage, parseOdsCells } from "./odf";
import { officeXmlFromBytes, unzipEntries, zipEntryText } from "./zip";

function gardenCell(value: string, patch?: Partial<SheetCell>): SheetCell {
  return {
    value,
    bold: patch?.bold ?? false,
    italic: patch?.italic ?? false,
    align: patch?.align ?? "left",
    format: patch?.format ?? "auto",
  };
}

function excelCellValue(cell: ExcelJS.Cell): string {
  if (cell.formula) return `=${cell.formula}`;
  const value = cell.value as unknown;
  if (value == null) return "";
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.formula === "string") return `=${rec.formula}`;
    if (Array.isArray(rec.richText)) {
      return rec.richText.map((part) => String((part as { text?: string }).text ?? "")).join("");
    }
    if (typeof rec.text === "string") return rec.text;
    if (typeof rec.result === "number" || typeof rec.result === "string") return String(rec.result);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value);
}

function excelAlign(cell: ExcelJS.Cell): SheetCell["align"] {
  const h = cell.alignment?.horizontal;
  if (h === "center") return "center";
  if (h === "right") return "right";
  return "left";
}

async function importXlsx(bytes: Uint8Array, name: string): Promise<InterchangeResult> {
  const warnings: InterchangeResult["warnings"] = [];
  const entries = unzipEntries(bytes);
  const names = Object.keys(entries);
  if (names.some((name) => /vbaProject/i.test(name))) {
    warnings.push(warning("xlsx-macros", "macros", "unsupported", "Macros and VBA are not imported."));
  }
  if (names.some((name) => /xl\/pivot/i.test(name))) {
    warnings.push(warning("xlsx-pivots", "pivots", "unsupported", "Pivot tables are not imported."));
  }
  if (names.some((name) => /xl\/charts\//i.test(name))) {
    warnings.push(warning("xlsx-charts", "charts", "unsupported", "Charts are not imported."));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytesAsBuffer(bytes));
  if (wb.worksheets.length > 1) {
    warnings.push(
      warning("xlsx-sheets", "worksheets", "partial", "Only the first worksheet is imported."),
    );
  }
  const sheet = wb.worksheets[0];
  if (!sheet) {
    warnings.push(warning("xlsx-empty", "workbook", "partial", "Workbook had no sheets."));
    const doc = createSheetDoc(name.replace(/\.xlsx$/i, "") || "Imported sheet");
    return { docs: [doc], warnings };
  }
  const cells: Record<string, SheetCell> = {};
  let maxRow = 0;
  let maxCol = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > SHEET_MAX_ROWS) return;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (colNumber > SHEET_MAX_COLS) return;
      const addr = cell.address;
      const value = excelCellValue(cell);
      if (!value) return;
      cells[addr] = gardenCell(value, {
        bold: Boolean(cell.font?.bold),
        italic: Boolean(cell.font?.italic),
        align: excelAlign(cell),
      });
      const coord = parseRef(addr);
      if (coord) {
        maxRow = Math.max(maxRow, coord.row);
        maxCol = Math.max(maxCol, coord.col);
      }
    });
  });
  warnings.push(
    warning("xlsx-subset", "formulas", "partial", "Macros, pivots, charts, and VBA are not imported."),
  );
  const doc = createSheetDoc(name.replace(/\.xlsx$/i, "") || "Imported sheet");
  return {
    docs: [
      {
        ...doc,
        body: {
          ...doc.body,
          rows: Math.min(Math.max(maxRow + 1, 1), SHEET_MAX_ROWS),
          cols: Math.min(Math.max(maxCol + 1, 1), SHEET_MAX_COLS),
          cells,
        },
      },
    ],
    warnings,
  };
}

function bytesAsBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function exportXlsx(doc: SheetDoc): Promise<{ bytes: Uint8Array; warnings: InterchangeResult["warnings"] }> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  for (const [ref, cell] of Object.entries(doc.body.cells)) {
    const target = sheet.getCell(ref);
    if (cell.value.startsWith("=")) target.value = { formula: cell.value.slice(1) };
    else target.value = cell.value;
    target.font = { bold: cell.bold, italic: cell.italic };
    target.alignment = { horizontal: cell.align };
  }
  const buffer = await wb.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
  return {
    bytes,
    warnings: [
      warning("xlsx-export-subset", "styles", "partial", "XLSX export keeps values, formulas, and basic style."),
    ],
  };
}

registerFormat({
  format: "xlsx",
  kind: "sheet",
  extensions: [".xlsx"],
  async importBytes(bytes, name) {
    try {
      return await importXlsx(bytes, name);
    } catch {
      const xml = officeXmlFromBytes(bytes);
      const values = [...xml.matchAll(/<v>([^<]*)<\/v>/g)].map((m) => m[1]);
      const doc = createSheetDoc(name.replace(/\.xlsx$/i, "") || "Imported sheet");
      const cells: Record<string, SheetCell> = {};
      values.slice(0, 64).forEach((value, i) => {
        cells[`A${i + 1}`] = gardenCell(value);
      });
      return {
        docs: [{ ...doc, body: { ...doc.body, cells } }],
        warnings: [
          warning("xlsx-subset", "formulas", "partial", "Spreadsheet XML fallback imported cached values only."),
        ],
      };
    }
  },
  async exportDoc(doc) {
    if (doc.kind !== "sheet") throw new Error("XLSX export expects a sheet document");
    return exportXlsx(doc);
  },
});

registerFormat({
  format: "ods",
  kind: "sheet",
  extensions: [".ods"],
  async importBytes(bytes, name) {
    const xml = zipEntryText(bytes, "content.xml") ?? officeXmlFromBytes(bytes);
    const parsed = parseOdsCells(xml);
    const doc = createSheetDoc(name.replace(/\.ods$/i, "") || "Imported sheet");
    const warnings: InterchangeResult["warnings"] = [
      warning("ods-subset", "styles", "partial", "ODS import keeps cell text and formulas."),
    ];
    if ((xml.match(/<table:table[\s>]/g) ?? []).length > 1) {
      warnings.push(warning("ods-sheets", "worksheets", "partial", "Only the first table is imported."));
    }
    return {
      docs: [
        {
          ...doc,
          body: {
            ...doc.body,
            rows: Math.min(parsed.rows, SHEET_MAX_ROWS),
            cols: Math.min(parsed.cols, SHEET_MAX_COLS),
            cells: parsed.cells,
          },
        },
      ],
      warnings,
    };
  },
  async exportDoc(doc) {
    if (doc.kind !== "sheet") throw new Error("ODS export expects a sheet document");
    return {
      bytes: buildOdsPackage(doc.body.cells, doc.body.rows, doc.body.cols),
      warnings: [warning("ods-export-subset", "styles", "partial", "ODS export is a cell-value subset.")],
    };
  },
});
