import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createCanvasDoc, createDeckDoc, makeCanvasNode, makeSlide } from "@/lib/docs/factories";

const WELCOME = `# Welcome to garden

This is a **markdown** document in a workspace with four surfaces — a document
editor, a PDF reader, a presentation editor and a drawing canvas — and a local
AI model that can work across all of them.

Type markdown directly: headings, \`inline code\`, lists, quotes and fenced
code blocks. The assistant reads and edits the same markdown.

## What makes it different

The assistant does not type into your document. Every surface has a typed set of
operations, and the model proposes a batch of them. You see exactly what it
wants to change before anything happens, and accepting is a normal edit that
ctrl+Z undoes.

Because the operations are the same ones the editors use, the model can build
*across* surfaces: turn this document into slides, sketch its structure on a
canvas, or read a PDF and draft a deck from it.

## Try it

- Open the assistant panel on the right and pick **Turn into slides**. A new
  deck appears in the second pane, drafted from this document.
- Or select a paragraph and ask for it to be tightened.
- Drop a PDF anywhere in the window to read and annotate it.

## Running a local model

Without a local server the assistant falls back to scripted replies, clearly
labelled as such in the header. To use a real model, start anything that speaks
the OpenAI API — \`ollama serve\` is the shortest path — and click the badge in
the header to re-check.`;

function welcomeDoc() {
  return textFromMarkdown("Welcome to garden", WELCOME);
}

function diagramDoc() {
  const doc = createCanvasDoc("How an edit flows");

  const boxes = [
    { id: "nd_seed1", text: "You ask", x: 80, y: 200 },
    { id: "nd_seed2", text: "Model proposes\noperations", x: 340, y: 200 },
    { id: "nd_seed3", text: "Schema validates", x: 600, y: 200 },
    { id: "nd_seed4", text: "You review", x: 860, y: 200 },
  ].map((spec) =>
    makeCanvasNode({
      kind: "rect",
      id: spec.id,
      x: spec.x,
      y: spec.y,
      w: 190,
      h: 100,
      text: spec.text,
      fill: "#eceafe",
      stroke: "#4f46e5",
      fontSize: 15,
    }),
  );

  // Sits directly under the last box so its connector drops straight down.
  // Elbow routing takes the shortest path, not an obstacle-avoiding one, so a
  // node placed off to the side would have its connector cut through a shape.
  const applied = makeCanvasNode({
    kind: "ellipse",
    id: "nd_seed5",
    x: 855,
    y: 400,
    w: 200,
    h: 96,
    text: "Document changes",
    fill: "#dcfce7",
    stroke: "#15803d",
    fontSize: 15,
  });

  const connectors = [
    ["nd_seed1", "nd_seed2", ""],
    ["nd_seed2", "nd_seed3", ""],
    ["nd_seed3", "nd_seed4", "valid"],
    ["nd_seed4", "nd_seed5", "accepted"],
  ].map(([from, to, label]) =>
    makeCanvasNode({
      kind: "connector",
      from: { nodeId: from },
      to: { nodeId: to },
      label,
      arrowEnd: true,
      stroke: "#94a3b8",
    }),
  );

  const title = makeCanvasNode({
    kind: "text",
    id: "nd_seed0",
    x: 80,
    y: 110,
    w: 600,
    h: 40,
    text: "Nothing reaches a document unreviewed",
    fontSize: 24,
    weight: "bold",
  });

  return {
    ...doc,
    body: {
      ...doc.body,
      nodes: [title, ...boxes, applied, ...connectors],
      viewport: { x: 40, y: 20, zoom: 0.85 },
    },
  };
}

function deckDoc() {
  const doc = createDeckDoc("A four-surface workspace");
  return {
    ...doc,
    body: {
      ...doc.body,
      slides: [
        makeSlide("title", {
          title: "A four-surface workspace",
          subtitle: "Documents, PDFs, slides and drawings — one AI collaborator",
          notes: "Open on why these four belong together rather than in four apps.",
        }),
        makeSlide("bullets", {
          title: "One document model",
          bullets: [
            "Every surface is typed JSON with a typed edit vocabulary",
            "User actions and AI actions run through the same reducer",
            "So every AI edit is previewable, rejectable and undoable",
          ],
          notes: "This is the whole argument. Do not rush it.",
        }),
        makeSlide("two-column", {
          title: "What the assistant can reach",
          left: ["The open document", "Your current selection", "The other open pane"],
          right: ["Propose edits", "Build a new document", "Never act unreviewed"],
          notes: "The second pane is the point — source on one side, result on the other.",
        }),
        makeSlide("title-body", {
          title: "Try it",
          body: "Pick a recipe in the assistant panel. Nothing is applied until you accept it.",
          notes: "Hand over to a live demo here.",
        }),
      ],
    },
  };
}

export const welcomePacket: SeedPacket = {
  id: "garden/welcome",
  version: 1,
  label: "Welcome",
  blurb: "The four-surface tour: a document, a diagram of how edits flow, and a starter deck.",
  starterArtifacts: [
    { localId: "welcome", kind: "text", title: "Welcome to garden", build: welcomeDoc },
    { localId: "diagram", kind: "canvas", title: "How an edit flows", build: diagramDoc },
    { localId: "deck", kind: "deck", title: "A four-surface workspace", build: deckDoc },
  ],
  layout: {
    open: [
      { localId: "welcome", pane: 0 },
      { localId: "diagram", pane: 1 },
    ],
    splitView: true,
  },
  featuredRecipeIds: ["doc-to-deck", "doc-to-canvas"],
  assistantPromptAddenda: [
    "This workspace was planted from the garden welcome packet. The user is learning " +
      "a four-surface suite (document, canvas, deck, PDF) whose assistant proposes typed " +
      "operations rather than typing into the document. Prefer recipes that show " +
      "cross-surface work: a document becoming slides or a diagram.",
  ],
};
