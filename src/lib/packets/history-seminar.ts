import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createCanvasDoc, createDeckDoc, makeCanvasNode, makeSlide } from "@/lib/docs/factories";

const SYLLABUS = `# History 312 — The Long Nineteenth Century

Seminar, Thursdays 2–5. Primary sources on the table; secondary sources in the
margins. Dates are arguments, not decorations.

## Aims

- Read a primary source as a made thing (audience, genre, silence) before
  treating it as evidence.
- Keep chronology honest: a claim that cannot sit on the timeline does not
  belong in the paper.
- Distinguish what a source *says* from what we *need* it to say.

## Weeks

1. **What is a century?** Koselleck, *Futures Past* (excerpt); the 1789–1914 frame.
2. **Revolutionary publics.** Paine, *Rights of Man* (sel.); Hunt on the family romance.
3. **Industry and the body.** Engels, *Condition of the Working Class* (sel.).
4. **Empire as a method.** Said, *Orientalism* (ch. 1); a Company dispatch.
5. **The social question.** Marx, *18th Brumaire* (sel.); a factory inspector's report.
6. **Nations, invented.** Anderson, *Imagined Communities* (ch. 1–3).
7. **Science and race.** A craniometry table; Gould's critique (sel.).
8. **Fin de siècle.** A decadent manifesto; a suffrage speech.

## Written work

- Weekly source note (one primary, 400–600 words) due Wednesday night.
- Midterm: a 1,500-word source essay. Final: a 4,000-word research paper.

Replace the readings with your own. The assistant can draft discussion questions
from a source note, or turn a week's theme into lecture slides — it must not
invent a citation.`;

const READING_NOTES = `# Source note — week 2

**Source.** Thomas Paine, *Rights of Man*, Part I (1791), excerpt on hereditary
government.

**Genre / audience.** A pamphlet written to be read aloud as much as silently;
aimed at a public that already knew Burke's *Reflections*.

**What it says.** Hereditary monarchy is a category error: wisdom is not a
property that descends. The living are not bound by the dead.

**What it does not say.** How a republic appoints its own successors without
reproducing the same error in a different costume. The colonies, almost entirely.

**Questions for Thursday.**

- Paine's "we" — who is included, and who would have been in the room?
- Is the argument historical (1789 happened) or philosophical (it *had* to)?

**Secondary to pair.** Hunt, *The Family Romance of the French Revolution*, ch. 1.

Write the next week's note above this line. Keep quotes short; the seminar has
the text.`;

function timelineDoc() {
  const doc = createCanvasDoc("Course timeline");

  const nodes = [
    { id: "nd_h0", text: "1789", x: 80, y: 220, w: 140 },
    { id: "nd_h1", text: "1815", x: 300, y: 220, w: 140 },
    { id: "nd_h2", text: "1848", x: 520, y: 220, w: 140 },
    { id: "nd_h3", text: "1870", x: 740, y: 220, w: 140 },
    { id: "nd_h4", text: "1914", x: 960, y: 220, w: 140 },
  ].map((spec) =>
    makeCanvasNode({
      kind: "ellipse",
      id: spec.id,
      x: spec.x,
      y: spec.y,
      w: spec.w,
      h: 88,
      text: spec.text,
      fill: "#fef3c7",
      stroke: "#b45309",
      fontSize: 18,
    }),
  );

  const labels = [
    { id: "nd_hl0", text: "Revolution", x: 70, y: 340 },
    { id: "nd_hl1", text: "Restoration", x: 280, y: 340 },
    { id: "nd_hl2", text: "Springtime", x: 500, y: 340 },
    { id: "nd_hl3", text: "Nation-states", x: 710, y: 340 },
    { id: "nd_hl4", text: "The lights go out", x: 930, y: 340 },
  ].map((spec) =>
    makeCanvasNode({
      kind: "text",
      id: spec.id,
      x: spec.x,
      y: spec.y,
      w: 180,
      h: 36,
      text: spec.text,
      fontSize: 14,
    }),
  );

  const connectors = [
    ["nd_h0", "nd_h1"],
    ["nd_h1", "nd_h2"],
    ["nd_h2", "nd_h3"],
    ["nd_h3", "nd_h4"],
  ].map(([from, to]) =>
    makeCanvasNode({
      kind: "connector",
      from: { nodeId: from },
      to: { nodeId: to },
      arrowEnd: true,
      stroke: "#b45309",
    }),
  );

  const title = makeCanvasNode({
    kind: "text",
    id: "nd_ht",
    x: 80,
    y: 110,
    w: 640,
    h: 40,
    text: "A century is a claim about continuity",
    fontSize: 22,
    weight: "bold",
  });

  return {
    ...doc,
    body: {
      ...doc.body,
      nodes: [title, ...nodes, ...labels, ...connectors],
      viewport: { x: 20, y: 20, zoom: 0.85 },
    },
  };
}

function lectureDoc() {
  const doc = createDeckDoc("Week 2 — Revolutionary publics");
  return {
    ...doc,
    body: {
      ...doc.body,
      slides: [
        makeSlide("title", {
          title: "Revolutionary publics",
          subtitle: "History 312 · Week 2 · Paine, Burke, and who gets to speak",
          notes: "Start from the room: who is in a 1791 coffeehouse, and who is not.",
        }),
        makeSlide("bullets", {
          title: "Paine's move",
          bullets: [
            "Heredity is a category error, not a tradition",
            "The living are not bound by the dead",
            "A pamphlet is a public, not a treatise",
          ],
          notes: "Read one short paragraph aloud. Ask what 'we' refers to.",
        }),
        makeSlide("two-column", {
          title: "What to do with Burke",
          left: ["Prescription as wisdom", "Society as inheritance", "Revolution as vandalism"],
          right: ["Name the audience", "Find the silence", "Do not steelman past the text"],
          notes: "Resist the temptation to make Burke a cartoon. He is more useful as a problem.",
        }),
        makeSlide("title-body", {
          title: "For next week",
          body: "Engels, Condition of the Working Class — one scene, not the whole argument. Bring a sentence you distrust.",
          notes: "Hand back source notes at the door.",
        }),
      ],
    },
  };
}

export const historySeminarPacket: SeedPacket = {
  id: "garden/history-seminar",
  version: 1,
  label: "History seminar",
  blurb: "A syllabus, a source-note habit, a timeline, and a lecture deck for the next session.",
  starterArtifacts: [
    { localId: "syllabus", kind: "text", title: "Syllabus", build: () => textFromMarkdown("Syllabus", SYLLABUS) },
    {
      localId: "notes",
      kind: "text",
      title: "Source notes",
      build: () => textFromMarkdown("Source notes", READING_NOTES),
    },
    { localId: "timeline", kind: "canvas", title: "Course timeline", build: timelineDoc },
    { localId: "lecture", kind: "deck", title: "Week 2 — Revolutionary publics", build: lectureDoc },
  ],
  layout: {
    open: [
      { localId: "syllabus", pane: 0 },
      { localId: "lecture", pane: 1 },
    ],
    splitView: true,
  },
  recipes: [
    {
      id: "notes-to-discussion",
      label: "Draft discussion questions",
      hint: "Turn this source note into Thursday's questions",
      from: ["text"],
      target: "text",
      prompt:
        "Draft five seminar discussion questions from this document. Ground each question in " +
        "a specific claim or silence in the source — do not invent quotations or page numbers. " +
        "Insert them under a '## Discussion questions' heading at the end. Leave the rest of " +
        "the document unchanged. Prefer questions that distinguish what the source says from " +
        "what later historians have needed it to say.",
    },
    {
      id: "notes-to-lecture",
      label: "Lecture from these notes",
      hint: "Draft a session deck from the source note",
      from: ["text"],
      target: "deck",
      newTitle: (title) => `${title} — lecture`,
      prompt:
        "Draft a lecture deck from this source note. Title slide, then one slide per major " +
        "move in the note, then a closing slide of questions for the room. Do not invent " +
        "citations, dates, or quotations that are not in the source. Speaker notes should " +
        "tell the instructor what to ask, not repeat the slide.",
    },
  ],
  featuredRecipeIds: ["notes-to-discussion", "notes-to-lecture", "doc-to-deck"],
  assistantPromptAddenda: [
    "This workspace is a history seminar. Distinguish primary from secondary sources. " +
      "Never invent a citation, date, quotation, or archival reference. If a date is uncertain, " +
      "say so. Prefer questions that sit on a timeline over grand claims that cannot.",
  ],
};
