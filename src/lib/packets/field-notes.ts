import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createCanvasDoc, makeCanvasNode } from "@/lib/docs/factories";

const LOG = `# Field log

**Site.** (name, and what the locals call it if that differs)
**Date / time.**
**Weather / light.**
**Who was present.** (including you, and your role)

## Observations

Write what you can point at. Sound, smell, who stood where, what was said
*verbatim* if you have it. Keep interpretation out of this section.

-

## What I think I saw

Separate from the above. A hunch belongs here, labelled as a hunch. If a
later write-up collapses the two, the debrief will lie.

## Questions to ask next visit

-

## Media still to file

- [ ] Sketch / photo
- [ ] Audio
- [ ] Consent note

The assistant can turn observations into a debrief, or sketch the site from
the log. It must not promote a hunch into a finding, or invent a quotation.`;

const DEBRIEF = `# Debrief

A write-up is not the log with nicer sentences. It is an argument about what
the visit can support — and what it cannot.

## What the visit established

Only claims that can be traced to an observation in the log. Quote sparingly.

## What remains a hunch

Move every interpretive sentence here if it slipped into the log. Do not
delete hunches; quarantine them.

## Contradictions

Where two observations do not fit. Resist resolving them on the page.

## Next site / next question

One visit, one next step. If the next step needs a different surface (a
sketch, a table of people), say so rather than growing this document.

When you ask the assistant to write this up from the log, check that nothing
in "established" was only in "what I think I saw."`;

function siteSketchDoc() {
  const doc = createCanvasDoc("Site sketch");

  const frame = makeCanvasNode({
    kind: "frame",
    id: "nd_f0",
    x: 60,
    y: 80,
    w: 920,
    h: 560,
    name: "Site",
    fill: "#f8fafc",
    stroke: "#94a3b8",
  });

  const entrance = makeCanvasNode({
    kind: "rect",
    id: "nd_s1",
    x: 100,
    y: 300,
    w: 140,
    h: 80,
    text: "Entrance",
    fill: "#e2e8f0",
    stroke: "#475569",
    fontSize: 14,
  });

  const yard = makeCanvasNode({
    kind: "rect",
    id: "nd_s2",
    x: 300,
    y: 220,
    w: 280,
    h: 240,
    text: "Yard / gathering",
    fill: "#dcfce7",
    stroke: "#15803d",
    fontSize: 14,
  });

  const building = makeCanvasNode({
    kind: "rect",
    id: "nd_s3",
    x: 640,
    y: 180,
    w: 280,
    h: 160,
    text: "Main building",
    fill: "#e0f2fe",
    stroke: "#0369a1",
    fontSize: 14,
  });

  const edge = makeCanvasNode({
    kind: "rect",
    id: "nd_s4",
    x: 640,
    y: 380,
    w: 280,
    h: 120,
    text: "Edge / out of earshot",
    fill: "#fef3c7",
    stroke: "#b45309",
    fontSize: 14,
  });

  const you = makeCanvasNode({
    kind: "ellipse",
    id: "nd_s5",
    x: 120,
    y: 420,
    w: 100,
    h: 64,
    text: "You",
    fill: "#eceafe",
    stroke: "#4f46e5",
    fontSize: 14,
  });

  const connectors = [
    ["nd_s1", "nd_s2", "in"],
    ["nd_s2", "nd_s3", ""],
    ["nd_s2", "nd_s4", "aside"],
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

  const caption = makeCanvasNode({
    kind: "text",
    id: "nd_sc",
    x: 100,
    y: 660,
    w: 720,
    h: 40,
    text: "Relabel from the log. Where you stood matters as much as what you heard.",
    fontSize: 14,
  });

  return {
    ...doc,
    body: {
      ...doc.body,
      nodes: [frame, entrance, yard, building, edge, you, ...connectors, caption],
      viewport: { x: 20, y: 20, zoom: 0.8 },
    },
  };
}

export const fieldNotesPacket: SeedPacket = {
  id: "garden/field-notes",
  label: "Field notes",
  blurb: "A visit log that keeps observation apart from interpretation, a site sketch, and a debrief.",
  docs: [
    { localId: "log", kind: "text", title: "Field log", build: () => textFromMarkdown("Field log", LOG) },
    { localId: "sketch", kind: "canvas", title: "Site sketch", build: siteSketchDoc },
    { localId: "debrief", kind: "text", title: "Debrief", build: () => textFromMarkdown("Debrief", DEBRIEF) },
  ],
  open: [
    { localId: "log", pane: 0 },
    { localId: "sketch", pane: 1 },
  ],
  splitView: true,
  recipes: [
    {
      id: "log-to-debrief",
      label: "Write up this visit",
      hint: "Turn the log into a debrief without promoting hunches",
      from: ["text"],
      target: "text",
      newTitle: (title) => `${title} — debrief`,
      prompt:
        "Write a debrief from this field log. Put only claims that are grounded in the " +
        "Observations section under 'what the visit established'. Move every interpretive " +
        "sentence to 'what remains a hunch'. Do not invent quotations, people, or events. " +
        "If the log is already a debrief, tighten it using the same split.",
    },
    {
      id: "log-to-site",
      label: "Sketch the site from this log",
      hint: "Diagram places and positions named in the notes",
      from: ["text"],
      target: "canvas",
      newTitle: (title) => `${title} — site`,
      prompt:
        "Draw a site sketch from the places and positions named in this field log. One " +
        "labelled shape per named place or person-position, laid out as the log describes, " +
        "with connectors for movement or line of sight. Do not invent places that are not " +
        "in the log. Keep it under twelve shapes.",
    },
  ],
  featuredRecipeIds: ["log-to-debrief", "log-to-site", "canvas-to-doc"],
  systemPromptAddenda:
    "This workspace is a field-notes kit. Keep observational sentences separate from " +
    "interpretive ones. Never invent a quotation, a person, or an event. If the user asks " +
    "for a write-up, do not promote a hunch into a finding.",
};
