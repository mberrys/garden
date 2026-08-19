import type { Doc, DocKind } from "@/lib/docs/schema";
import { docToMarkdown } from "@/lib/text/markdown";
import { indexToCol, parseRef, toRef } from "@/lib/sheet/refs";
import type { SurfaceSelection } from "@/lib/store/workspace";

/**
 * Serialises a document into the view the model gets.
 *
 * Two constraints shape every format here:
 *  1. A 7B model has a small effective context. Verbose JSON crowds out the
 *     actual content, so each surface gets a compact line-oriented rendering.
 *  2. Ops address things by id or index, so every id and index the model might
 *     need to reference has to appear in the text it reads.
 */

/** Rough character budgets — generous enough to be useful, small enough to fit. */
const BUDGET: Record<DocKind, number> = {
  text: 12_000,
  canvas: 8_000,
  deck: 10_000,
  pdf: 14_000,
  sheet: 10_000,
};

export interface DocContext {
  /** Human-readable rendering handed to the model. */
  content: string;
  /** True when content was cut to fit the budget. */
  truncated: boolean;
}

export function serializeDoc(doc: Doc, selection?: SurfaceSelection): DocContext {
  switch (doc.kind) {
    case "text":
      return clamp(serializeText(doc), BUDGET.text);
    case "canvas":
      return clamp(serializeCanvas(doc), BUDGET.canvas);
    case "deck":
      return clamp(serializeDeck(doc), BUDGET.deck);
    case "pdf":
      return clamp(serializePdf(doc, selection), BUDGET.pdf);
    case "sheet":
      return clamp(serializeSheet(doc), BUDGET.sheet);
  }
}

function clamp(content: string, budget: number): DocContext {
  if (content.length <= budget) return { content, truncated: false };
  return {
    content: `${content.slice(0, budget)}\n\n[…truncated, document continues…]`,
    truncated: true,
  };
}

/* ------------------------------------------------------------------ *
 * Per-surface renderings
 * ------------------------------------------------------------------ */

function serializeText(doc: Extract<Doc, { kind: "text" }>): string {
  const blocks = doc.body.content ?? [];
  if (blocks.length === 0) return "(empty document)";

  // Each block is prefixed with its index, because text ops address blocks by
  // index and the model has no other way to know what index a paragraph is at.
  return blocks
    .map((block, i) => {
      const markdown = docToMarkdown({ type: "doc", content: [block] });
      return `[${i}] ${markdown || "(empty)"}`;
    })
    .join("\n\n");
}

function serializeCanvas(doc: Extract<Doc, { kind: "canvas" }>): string {
  const nodes = doc.body.nodes;
  if (nodes.length === 0) return "(empty canvas)";

  const lines = nodes.map((node) => {
    const label = "text" in node && node.text ? ` "${node.text}"` : "";
    switch (node.kind) {
      case "rect":
      case "ellipse":
      case "diamond":
      case "text":
        return `${node.id} ${node.kind} at (${round(node.x)},${round(node.y)}) size ${round(node.w)}x${round(node.h)}${label}`;
      case "frame":
        return `${node.id} frame "${node.name}" at (${round(node.x)},${round(node.y)}) size ${round(node.w)}x${round(node.h)}`;
      case "line":
        return `${node.id} line ${pointsSummary(node.points, 2)}`;
      case "ink":
        return `${node.id} ink stroke (${Math.floor(node.points.length / 3)} points)`;
      case "connector":
        return `${node.id} connector ${node.from.nodeId ?? "(free)"} -> ${node.to.nodeId ?? "(free)"}${node.label ? ` labelled "${node.label}"` : ""}`;
    }
  });

  return `${nodes.length} node(s), paint order first to last:\n${lines.join("\n")}`;
}

function serializeDeck(doc: Extract<Doc, { kind: "deck" }>): string {
  if (doc.body.slides.length === 0) return "(empty deck)";

  return doc.body.slides
    .map((slide, i) => {
      const parts = [`slide ${i} id=${slide.id} layout=${slide.layout}`];
      for (const el of slide.elements) {
        if (el.type === "text" && el.text) parts.push(`  text ${el.id}: ${el.text}`);
        else if (el.type === "bullets" && el.items.length) {
          parts.push(`  bullets ${el.id}:`);
          for (const item of el.items) parts.push(`    - ${item}`);
        } else if (el.type === "shape") parts.push(`  shape ${el.id}: ${el.shape}`);
        else if (el.type === "image") parts.push(`  image ${el.id}: ${el.alt || "(no caption)"}`);
      }
      if (slide.notes) parts.push(`  notes: ${slide.notes}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function serializePdf(
  doc: Extract<Doc, { kind: "pdf" }>,
  selection?: SurfaceSelection,
): string {
  const { pageCount, fileName, annotations, pageText } = doc.body;
  const header = `PDF "${fileName || doc.title}", ${pageCount} page(s).`;

  const extracted = Object.entries(pageText)
    .map(([page, text]) => ({ page: Number(page), text }))
    .filter((p) => p.text.trim())
    .sort((a, b) => a.page - b.page);

  const parts = [header];

  if (annotations.length) {
    parts.push(
      `\nAnnotations:\n${annotations
        .map(
          (a) =>
            `  ${a.id} ${a.type} p${a.page}${a.quote ? ` on "${truncate(a.quote, 120)}"` : ""}${a.note ? ` — note: ${a.note}` : ""}`,
        )
        .join("\n")}`,
    );
  }

  if (extracted.length === 0) {
    parts.push("\nNo text extracted yet — scroll through the pages to extract them.");
    return parts.join("\n");
  }

  // Prioritise the page the user is looking at; a 300-page PDF cannot all fit.
  const focus = selection?.kind === "pdf" ? selection.page : extracted[0].page;
  const ordered = [...extracted].sort(
    (a, b) => Math.abs(a.page - focus) - Math.abs(b.page - focus),
  );

  parts.push("\nPage text:");
  for (const page of ordered) {
    parts.push(`\n--- page ${page.page} ---\n${page.text.trim()}`);
  }

  return parts.join("\n");
}

function serializeSheet(doc: Extract<Doc, { kind: "sheet" }>): string {
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

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

export function describeSelection(selection: SurfaceSelection | undefined): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case "text":
      return selection.text
        ? `The user has selected block ${selection.blockIndex}${
            selection.blockCount > 1 ? `–${selection.blockIndex + selection.blockCount - 1}` : ""
          }: "${truncate(selection.text, 400)}"`
        : null;
    case "canvas":
      return selection.nodeIds.length
        ? `The user has selected canvas node(s): ${selection.nodeIds.join(", ")}`
        : null;
    case "deck":
      return selection.slideId
        ? `The user is on slide ${selection.slideId}${
            selection.elementIds.length ? `, element(s) ${selection.elementIds.join(", ")}` : ""
          }`
        : null;
    case "pdf":
      return selection.text
        ? `The user has selected text on page ${selection.page}: "${truncate(selection.text, 400)}"`
        : `The user is looking at page ${selection.page}`;
    case "sheet":
      if (selection.range) return `The user has selected the range ${selection.range}`;
      return selection.cell ? `The user has selected cell ${selection.cell}` : null;
  }
}

function round(n: number): number {
  return Math.round(n);
}

function pointsSummary(points: number[], stride: number): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += stride) {
    pairs.push(`(${round(points[i])},${round(points[i + 1])})`);
  }
  return pairs.slice(0, 6).join(" -> ") + (pairs.length > 6 ? " -> …" : "");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
