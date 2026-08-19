import { Presentation } from "lucide-react";
import type { DeckDoc, Doc } from "@/lib/docs/schema";
import { SLIDE_W, SLIDE_H } from "@/lib/docs/schema";
import { DeckOpSchema, applyDeckOps } from "@/lib/ops/deck";
import { createDeckDoc } from "@/lib/docs/factories";
import { docToMarkdown } from "@/lib/text/markdown";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeDeck(doc: DeckDoc): string {
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

function describeDeckSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "deck") return null;
  return selection.slideId
    ? `The user is on slide ${selection.slideId}${
        selection.elementIds.length ? `, element(s) ${selection.elementIds.join(", ")}` : ""
      }`
    : null;
}

function mockDeck(request: MockRequest): string {
  const doc = request.doc as DeckDoc;
  const ask = request.request.toLowerCase();
  const source = request.companions?.[0]?.doc;

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
  const bullets = source
    ? sourceHighlights(source)
    : ["First point", "Second point", "Third point"];

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

function describeDeckOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "addSlide":
      return `Add ${op.layout} slide${op.title ? ` "${truncate(String(op.title), 40)}"` : ""}`;
    case "insertSlide":
      return `Insert slide ${(op.slide as Record<string, unknown>).id}`;
    case "deleteSlide":
      return `Delete slide ${op.id}`;
    case "moveSlide":
      return `Move slide to position ${(op.toIndex as number) + 1}`;
    case "setSlide":
      return `Update slide (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    case "addElement":
      return `Add ${(op.element as Record<string, unknown>).type} element to a slide`;
    case "updateElement":
      return `Update element (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    case "deleteElement":
      return `Delete an element`;
    case "reorderElement":
      return `Restack an element`;
    case "setTheme":
      return `Change deck theme (${Object.keys(op.patch as Record<string, unknown>).join(", ")})`;
    default:
      return undefined;
  }
}

function deckReferencedBlobIds(doc: DeckDoc): Set<string> {
  const ids = new Set<string>();
  for (const slide of doc.body.slides) {
    for (const el of slide.elements) {
      if (el.type === "image" && el.blobId) ids.add(el.blobId);
    }
  }
  return ids;
}

function deckRemapBlobIds(doc: DeckDoc, map: Map<string, string>): DeckDoc {
  return {
    ...doc,
    body: {
      ...doc.body,
      slides: doc.body.slides.map((slide) => ({
        ...slide,
        elements: slide.elements.map((el) =>
          el.type === "image" && el.blobId && map.has(el.blobId)
            ? { ...el, blobId: map.get(el.blobId)! }
            : el,
        ),
      })),
    },
  };
}

registerSurface({
  kind: "deck",
  label: "Deck",
  icon: Presentation,
  iconColor: "#f59e0b",
  opSchema: DeckOpSchema,
  applyOps: applyDeckOps,
  createDoc: createDeckDoc,
  ownsHistory: false,
  contextBudget: 10_000,
  promptNotes:
    `Slides are ${SLIDE_W}x${SLIDE_H}. Prefer addSlide with a layout and text content over ` +
    "placing elements by hand; the layout does the typography and spacing for you. Keep " +
    "bullets under about twelve words each, and no more than six per slide.",
  serializeDoc: serializeDeck,
  describeSelection: describeDeckSelection,
  mockReply: mockDeck,
  describeOp: describeDeckOp,
  referencedBlobIds: deckReferencedBlobIds,
  remapBlobIds: deckRemapBlobIds,
  adapter: {
    engine: "garden",
    status: "not-required",
    userEdits: "stage gestures call commit with deck ops",
    gardenUpdates: "React host re-renders from DeckDoc.body",
    selection: "active slide + element ids, pushed to the workspace store",
    notes: "Garden-owned slide stage. Slides suite (#38) keeps this model; export is separate.",
    relatedIssue: 38,
  },
  loadComponent: () => import("@/surfaces/deck/deck-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
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
