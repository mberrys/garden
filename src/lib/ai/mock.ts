import type { CanvasDoc, DeckDoc, Doc, PdfDoc, SheetDoc, TextDoc } from "@/lib/docs/schema";
import { docToMarkdown } from "@/lib/text/markdown";
import { parseRef } from "@/lib/sheet/refs";
import type { SurfaceSelection } from "@/lib/store/workspace";
import { OPS_FENCE } from "./ops-block";

/**
 * Scripted stand-in for a local model.
 *
 * Used when no local server is reachable, and forced on in the e2e suite. It is
 * not a language model and does not pretend to be one — it pattern-matches the
 * request and returns a canned but *schema-valid* op batch for the surface, so
 * every AI path in the app (streaming, parsing, validation, review, accept,
 * reject, undo) is exercisable with nothing installed.
 *
 * It reads the real document, so the ops it emits reference real ids and apply
 * cleanly. Replies are clearly labelled as scripted in the UI.
 */

export interface MockRequest {
  doc: Doc;
  request: string;
  selection?: SurfaceSelection;
  companions?: { doc: Doc }[];
}

export function mockReply({ doc, request, selection, companions }: MockRequest): string {
  const ask = request.toLowerCase();
  switch (doc.kind) {
    case "text":
      return mockText(doc, ask, selection, companions);
    case "canvas":
      return mockCanvas(doc, ask, companions);
    case "deck":
      return mockDeck(doc, ask, companions);
    case "pdf":
      return mockPdf(doc, ask);
    case "sheet":
      return mockSheet(doc, ask, companions);
  }
}

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

function mockText(
  doc: TextDoc,
  ask: string,
  selection?: SurfaceSelection,
  companions?: { doc: Doc }[],
): string {
  const blockCount = doc.body.content?.length ?? 0;
  const source = companions?.[0]?.doc;

  if (source) {
    return block(
      `Drafted a summary of "${source.title}" at the top of this document.`,
      [
        {
          op: "insertMarkdown",
          index: 0,
          markdown: [
            `## Summary of ${source.title}`,
            "",
            "- The source material sets out its central claim early and returns to it throughout.",
            "- Supporting evidence is strongest in the middle section.",
            "- Open questions are left for the closing remarks.",
          ].join("\n"),
        },
      ],
    );
  }

  if (/outline|summar|tl;?dr|abstract/.test(ask)) {
    return block("Added an outline above the existing content.", [
      {
        op: "insertMarkdown",
        index: 0,
        markdown: ["## Outline", "", "1. Context and motivation", "2. What changed", "3. What it means", "4. Next steps"].join("\n"),
      },
    ]);
  }

  if (/rewrite|rephrase|tighten|edit|shorten|clarif/.test(ask)) {
    const index = selection?.kind === "text" ? selection.blockIndex : 0;
    const count = selection?.kind === "text" ? Math.max(1, selection.blockCount) : Math.min(1, blockCount);
    if (count === 0) {
      return block("There is nothing here to rewrite yet.", []);
    }
    return block(`Tightened ${count} block${count === 1 ? "" : "s"} starting at ${index}.`, [
      {
        op: "replaceMarkdown",
        index,
        count,
        markdown:
          "This passage has been tightened: the claim comes first, the supporting detail follows, and the hedging is gone.",
      },
    ]);
  }

  if (/heading|structure|section/.test(ask)) {
    return block("Added a section heading.", [
      { op: "insertMarkdown", index: blockCount, markdown: "## New section\n\nContent goes here." },
    ]);
  }

  return block("Added a paragraph at the end of the document.", [
    {
      op: "insertMarkdown",
      index: blockCount,
      markdown:
        "A scripted paragraph, appended by the mock provider. Start a local model to get a real one.",
    },
  ]);
}

/* ------------------------------------------------------------------ *
 * Canvas
 * ------------------------------------------------------------------ */

function mockCanvas(doc: CanvasDoc, ask: string, companions?: { doc: Doc }[]): string {
  const nodes = doc.body.nodes;
  const boxes = nodes.filter((n) => n.kind === "rect" || n.kind === "ellipse" || n.kind === "diamond");

  if (/align|tidy|clean ?up|arrange|distribute/.test(ask) && boxes.length >= 2) {
    const left = Math.min(...boxes.map((b) => ("x" in b ? b.x : 0)));
    return block(`Aligned ${boxes.length} shapes to x=${Math.round(left)}.`, [
      ...boxes.map((b) => ({ op: "updateNode", id: b.id, patch: { x: left } })),
    ]);
  }

  const source = companions?.[0]?.doc;
  const labels = source
    ? ["Context", "Method", "Findings", "Implications"]
    : /flow|process|pipeline|diagram|architecture/.test(ask)
      ? ["Input", "Process", "Output"]
      : ["Idea", "Detail"];

  const baseX = 120;
  const baseY = 140;
  const stepX = 260;
  const ids = labels.map((_, i) => `nd_mock${i}${Math.random().toString(36).slice(2, 5)}`);

  const ops: unknown[] = labels.map((label, i) => ({
    op: "addNode",
    node: {
      kind: i === 0 ? "rect" : i === labels.length - 1 ? "ellipse" : "rect",
      id: ids[i],
      x: baseX + i * stepX,
      y: baseY,
      w: 180,
      h: 96,
      text: label,
      fill: "#eceafe",
      stroke: "#4f46e5",
    },
  }));

  for (let i = 0; i < ids.length - 1; i++) {
    ops.push({
      op: "addNode",
      node: {
        kind: "connector",
        from: { nodeId: ids[i], anchor: "right" },
        to: { nodeId: ids[i + 1], anchor: "left" },
        arrowEnd: true,
      },
    });
  }

  return block(
    source
      ? `Sketched a ${labels.length}-step diagram from "${source.title}".`
      : `Sketched a ${labels.length}-step diagram.`,
    ops,
  );
}

/* ------------------------------------------------------------------ *
 * Deck
 * ------------------------------------------------------------------ */

function mockDeck(doc: DeckDoc, ask: string, companions?: { doc: Doc }[]): string {
  const source = companions?.[0]?.doc;

  if (/notes|speaker/.test(ask) && doc.body.slides.length > 0) {
    return block(
      `Wrote speaker notes for ${doc.body.slides.length} slide${doc.body.slides.length === 1 ? "" : "s"}.`,
      doc.body.slides.map((slide, i) => ({
        op: "setSlide",
        id: slide.id,
        patch: {
          notes:
            i === 0
              ? "Open by naming the problem in one sentence, then pause before the agenda."
              : "Land the point on this slide before advancing; invite questions if the room is quiet.",
        },
      })),
    );
  }

  const title = source ? source.title : doc.title;
  const bullets = source ? sourceHighlights(source) : ["First point", "Second point", "Third point"];

  return block(
    source ? `Drafted four slides from "${source.title}".` : "Drafted four slides.",
    [
      { op: "addSlide", layout: "title", title, subtitle: "Drafted by the mock provider" },
      { op: "addSlide", layout: "bullets", title: "Key points", bullets },
      {
        op: "addSlide",
        layout: "two-column",
        title: "What worked, what did not",
        left: ["Clear framing", "Good evidence"],
        right: ["Thin on cost", "No timeline"],
      },
      {
        op: "addSlide",
        layout: "title-body",
        title: "Next steps",
        body: "Agree the owner and the date before this meeting ends.",
        notes: "Do not leave without a name against each action.",
      },
    ],
  );
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

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

function mockPdf(doc: PdfDoc, ask: string): string {
  const { pageCount, pageText, annotations } = doc.body;

  if (pageCount === 0) {
    return block("There is no PDF attached to this document yet.", []);
  }

  if (/summar|what.*say|about/.test(ask) && !/highlight|mark|annotate/.test(ask)) {
    const extracted = Object.values(pageText).filter(Boolean).length;
    return block(
      extracted > 0
        ? `This is a ${pageCount}-page document; ${extracted} page${extracted === 1 ? " has" : "s have"} been read so far. ` +
            `It carries ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}. ` +
            `A real local model would summarise the contents here.`
        : `This is a ${pageCount}-page document, but no pages have been read yet — scroll through it and ask again.`,
      [],
    );
  }

  const pages = Object.keys(pageText)
    .map(Number)
    .filter((page) => pageText[String(page)]?.trim())
    .sort((a, b) => a - b)
    .slice(0, 3);

  if (pages.length === 0) {
    return block("No page text has been extracted yet — scroll through the pages and ask again.", []);
  }

  return block(
    `Marked a passage on ${pages.length} page${pages.length === 1 ? "" : "s"}.`,
    pages.map((page, i) => ({
      op: "addAnnotation",
      page,
      type: i === 0 ? "highlight" : "box",
      rect: { x: 0.1, y: 0.18 + i * 0.12, w: 0.78, h: 0.05 },
      quote: truncate((pageText[String(page)] ?? "").replace(/\s+/g, " ").trim(), 120),
      note: i === 0 ? "Scripted highlight from the mock provider." : "",
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Sheet
 * ------------------------------------------------------------------ */

function mockSheet(doc: SheetDoc, ask: string, companions?: { doc: Doc }[]): string {
  const source = companions?.[0]?.doc;

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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Streams a scripted reply in chunks so the UI exercises the same incremental
 * rendering path a real model drives.
 */
export async function* streamMockReply(
  request: MockRequest,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const text = mockReply(request);
  const chunks = text.match(/[\s\S]{1,24}/g) ?? [];
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 12));
    yield chunk;
  }
}
