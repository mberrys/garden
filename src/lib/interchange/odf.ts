import type { SheetCell } from "@/lib/docs/schema";
import { SHEET_MAX_COLS, SHEET_MAX_ROWS } from "@/lib/docs/schema";
import { toRef } from "@/lib/sheet/refs";
import { innerText, xmlEscape } from "./xml";
import { zipOdf } from "./zip";

const ODT_MIME = "application/vnd.oasis.opendocument.text";
const ODS_MIME = "application/vnd.oasis.opendocument.spreadsheet";

function odfManifest(rootMime: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="${rootMime}"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>
`;
}

export function markdownToOdtXml(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const parts: string[] = [];
  for (const block of blocks) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(block);
    if (heading) {
      parts.push(
        `<text:h text:outline-level="${heading[1].length}">${xmlEscape(heading[2])}</text:h>`,
      );
      continue;
    }
    const listLines = block.split("\n").filter((line) => /^\s*[-*]\s+/.test(line));
    if (listLines.length === block.split("\n").length && listLines.length > 0) {
      parts.push("<text:list>");
      for (const line of listLines) {
        const item = line.replace(/^\s*[-*]\s+/, "");
        parts.push(`<text:list-item><text:p>${xmlEscape(item)}</text:p></text:list-item>`);
      }
      parts.push("</text:list>");
      continue;
    }
    parts.push(`<text:p>${xmlEscape(block.replace(/\n/g, " "))}</text:p>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">
  <office:body><office:text>
${parts.join("\n")}
  </office:text></office:body>
</office:document-content>
`;
}

export function buildOdtPackage(markdown: string): Uint8Array {
  return zipOdf(ODT_MIME, {
    "META-INF/manifest.xml": odfManifest(ODT_MIME),
    "content.xml": markdownToOdtXml(markdown),
  });
}

export function odtXmlToMarkdown(xml: string): string {
  const headingRe = /<text:h\b([^>]*)>([\s\S]*?)<\/text:h>/g;
  const paraRe = /<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g;
  const listItemRe = /<text:list-item\b[^>]*>([\s\S]*?)<\/text:list-item>/g;
  const listRanges = [...xml.matchAll(listItemRe)].map((m) => {
    const start = m.index ?? 0;
    return { start, end: start + m[0].length, text: `- ${innerText(m[1])}` };
  });

  const tokens: { index: number; text: string }[] = [
    ...[...xml.matchAll(headingRe)].map((m) => {
      const level = /text:outline-level="(\d+)"/.exec(m[1])?.[1] ?? "1";
      return { index: m.index ?? 0, text: `${"#".repeat(Number(level))} ${innerText(m[2])}` };
    }),
    ...listRanges.map((item) => ({ index: item.start, text: item.text })),
    ...[...xml.matchAll(paraRe)]
      .filter((m) => {
        const index = m.index ?? 0;
        return !listRanges.some((range) => index >= range.start && index < range.end);
      })
      .map((m) => ({
        index: m.index ?? 0,
        text: innerText(m[1]),
      })),
  ]
    .filter((t) => t.text.trim())
    .sort((a, b) => a.index - b.index);

  return tokens.map((token) => token.text).join("\n\n");
}

export function buildOdsPackage(cells: Record<string, SheetCell>, rows: number, cols: number): Uint8Array {
  const r = Math.min(Math.max(rows, 1), SHEET_MAX_ROWS);
  const c = Math.min(Math.max(cols, 1), SHEET_MAX_COLS);
  const tableRows: string[] = [];
  for (let row = 0; row < r; row++) {
    const tds: string[] = [];
    for (let col = 0; col < c; col++) {
      const ref = toRef({ row, col });
      const cell = cells[ref];
      if (!cell) {
        tds.push("<table:table-cell/>");
        continue;
      }
      const formula = cell.value.startsWith("=")
        ? ` table:formula="of:=${xmlEscape(cell.value.slice(1))}"`
        : "";
      tds.push(
        `<table:table-cell office:value-type="string"${formula}><text:p>${xmlEscape(cell.value)}</text:p></table:table-cell>`,
      );
    }
    tableRows.push(`<table:table-row>${tds.join("")}</table:table-row>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">
  <office:body><office:spreadsheet>
    <table:table table:name="Sheet1">
${tableRows.join("\n")}
    </table:table>
  </office:spreadsheet></office:body>
</office:document-content>
`;
  return zipOdf(ODS_MIME, {
    "META-INF/manifest.xml": odfManifest(ODS_MIME),
    "content.xml": xml,
  });
}

export function parseOdsCells(xml: string): {
  cells: Record<string, SheetCell>;
  rows: number;
  cols: number;
} {
  const cells: Record<string, SheetCell> = {};
  let maxRow = 0;
  let maxCol = 0;
  let row = 0;
  const rowRe = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g;
  for (const rowMatch of xml.matchAll(rowRe)) {
    const repeatRows = Number(/table:number-rows-repeated="(\d+)"/.exec(rowMatch[1])?.[1] ?? "1");
    let col = 0;
    const cellRe = /<table:table-cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
    const parsed: { span: number; cell: SheetCell | null }[] = [];
    for (const cellMatch of rowMatch[2].matchAll(cellRe)) {
      const span = Number(/table:number-columns-repeated="(\d+)"/.exec(cellMatch[1])?.[1] ?? "1");
      const formula = /table:formula="of:=([^"]*)"/.exec(cellMatch[1])?.[1];
      const text = cellMatch[2] ? innerText(cellMatch[2]) : "";
      const value = formula ? `=${formula}` : text;
      parsed.push({
        span,
        cell: value ? { value, bold: false, italic: false, align: "left", format: "auto" } : null,
      });
    }
    for (let i = 0; i < repeatRows && row < SHEET_MAX_ROWS; i++, row++) {
      col = 0;
      for (const item of parsed) {
        for (let s = 0; s < item.span && col < SHEET_MAX_COLS; s++, col++) {
          if (item.cell) {
            cells[toRef({ row, col })] = { ...item.cell };
            maxRow = Math.max(maxRow, row);
            maxCol = Math.max(maxCol, col);
          }
        }
      }
    }
  }
  return {
    cells,
    rows: Math.max(maxRow + 1, 1),
    cols: Math.max(maxCol + 1, 1),
  };
}
