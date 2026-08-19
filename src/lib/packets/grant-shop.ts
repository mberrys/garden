import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createCanvasDoc, createDeckDoc, makeCanvasNode, makeSlide } from "@/lib/docs/factories";

const BRIEF = `# Opportunity brief

**Funder.** (name the programme, not the brand)
**Call.** (paste the one-sentence purpose from the RFP)
**Deadline.** (date, timezone, and whether it is receipt or postmark)
**Ask.** (amount, duration, allowable costs)

## Fit

- Why this work, why this shop, why now — three sentences, no adjectives that
  could apply to anyone else.
- What we will *not* do, so the proposal does not swell to match the budget.

## Constraints the RFP actually named

- Eligibility (org type, geography, PI effort).
- Required attachments (letters, budget narrative, data-management plan).
- Evaluation criteria, copied in their language, not ours.

## Evidence we already have

- A result, a dataset, a partner letter — list only what is in hand.
- Gaps that would be dishonest to paper over.

The assistant may tighten prose and draft a pitch from the proposal. It must
not invent a metric, a partner, a letter, or a piece of evaluation.`;

const PROPOSAL = `# Proposal draft

## Project summary

In 150 words: the need, the approach, the outcome a reviewer can picture, and
who is accountable. No citations here.

## Need

State the problem as it exists for the people named in the brief, not as a
literature gap. One page. If a number is not in the brief or in a cited source
already in this workspace, leave a \`[source needed]\` marker rather than
inventing one.

## Approach

What we will do, in the order a programme officer could site-visit. Work
packages, not aspirations. Cross-reference the workplan canvas.

## Evaluation

What will have changed, how we will know, and who else could check. Match the
RFP's own criteria language.

## Budget narrative

Personnel, travel, and the one thing reviewers always cut. Do not invent line
items; mark unknowns.

## Attachments still missing

- [ ] Letters of support
- [ ] Data-management plan
- [ ] Biosketches

Write in the funder's register, not ours. Cut any sentence that could appear
in a different proposal with the names swapped.`;

function workplanDoc() {
  const doc = createCanvasDoc("Workplan");

  const boxes = [
    { id: "nd_g1", text: "Month 1–2\nMobilise", x: 80, y: 200 },
    { id: "nd_g2", text: "Month 3–6\nDo the work", x: 340, y: 200 },
    { id: "nd_g3", text: "Month 7–9\nEvidence", x: 600, y: 200 },
    { id: "nd_g4", text: "Month 10–12\nReport", x: 860, y: 200 },
  ].map((spec) =>
    makeCanvasNode({
      kind: "rect",
      id: spec.id,
      x: spec.x,
      y: spec.y,
      w: 200,
      h: 110,
      text: spec.text,
      fill: "#e0f2fe",
      stroke: "#0369a1",
      fontSize: 15,
    }),
  );

  const connectors = [
    ["nd_g1", "nd_g2"],
    ["nd_g2", "nd_g3"],
    ["nd_g3", "nd_g4"],
  ].map(([from, to]) =>
    makeCanvasNode({
      kind: "connector",
      from: { nodeId: from },
      to: { nodeId: to },
      arrowEnd: true,
      stroke: "#0369a1",
    }),
  );

  const title = makeCanvasNode({
    kind: "text",
    id: "nd_gt",
    x: 80,
    y: 110,
    w: 520,
    h: 40,
    text: "If it is not on this line, it is not in the grant",
    fontSize: 22,
    weight: "bold",
  });

  const note = makeCanvasNode({
    kind: "text",
    id: "nd_gn",
    x: 80,
    y: 360,
    w: 640,
    h: 48,
    text: "Replace the labels with the work packages from the proposal. Keep the year honest.",
    fontSize: 14,
  });

  return {
    ...doc,
    body: {
      ...doc.body,
      nodes: [title, ...boxes, ...connectors, note],
      viewport: { x: 20, y: 20, zoom: 0.85 },
    },
  };
}

function pitchDoc() {
  const doc = createDeckDoc("Pitch");
  return {
    ...doc,
    body: {
      ...doc.body,
      slides: [
        makeSlide("title", {
          title: "The ask",
          subtitle: "One sentence the programme officer can repeat",
          notes: "If this slide needs a paragraph, the summary is not ready.",
        }),
        makeSlide("bullets", {
          title: "Why this, why us, why now",
          bullets: [
            "The need in the funder's language",
            "The capacity already in the room",
            "The window that closes if this round is missed",
          ],
          notes: "No metric that is not in the brief or the proposal.",
        }),
        makeSlide("two-column", {
          title: "Work and proof",
          left: ["Work package A", "Work package B", "Work package C"],
          right: ["What changes", "How we know", "Who can check"],
          notes: "Point at the workplan canvas if it is open in the other pane.",
        }),
        makeSlide("title-body", {
          title: "What we still owe you",
          body: "Letters, a data-management plan, and the line items we have not costed. Name them rather than hiding them.",
          notes: "End on the deadline and the amount, spoken once.",
        }),
      ],
    },
  };
}

export const grantShopPacket: SeedPacket = {
  id: "garden/grant-shop",
  version: 1,
  label: "Grant shop",
  blurb: "An RFP brief, a proposal draft, a twelve-month workplan, and a pitch deck.",
  starterArtifacts: [
    { localId: "brief", kind: "text", title: "Opportunity brief", build: () => textFromMarkdown("Opportunity brief", BRIEF) },
    { localId: "proposal", kind: "text", title: "Proposal draft", build: () => textFromMarkdown("Proposal draft", PROPOSAL) },
    { localId: "workplan", kind: "canvas", title: "Workplan", build: workplanDoc },
    { localId: "pitch", kind: "deck", title: "Pitch", build: pitchDoc },
  ],
  layout: {
    open: [
      { localId: "proposal", pane: 0 },
      { localId: "pitch", pane: 1 },
    ],
    splitView: true,
  },
  recipes: [
    {
      id: "proposal-to-pitch",
      label: "Draft a pitch from this",
      hint: "Turn the proposal into a short deck",
      from: ["text"],
      target: "deck",
      newTitle: (title) => `${title} — pitch`,
      prompt:
        "Draft a short pitch deck from this proposal. Four to six slides: the ask, why this " +
        "team, the work packages, how success will be judged, and what is still missing. " +
        "Do not invent metrics, partners, letters, or budget figures. If a number is not in " +
        "the source, omit it or mark it as unknown in the speaker notes.",
    },
    {
      id: "proposal-flag-gaps",
      label: "Flag missing evidence",
      hint: "List claims that still need a source",
      from: ["text"],
      target: "text",
      prompt:
        "Read this document and insert a '## Gaps' section at the end listing every claim " +
        "that needs a source, a metric, a partner, or an attachment. Do not invent the " +
        "missing evidence. Do not change the rest of the document.",
    },
  ],
  featuredRecipeIds: ["proposal-to-pitch", "proposal-flag-gaps", "text-tighten"],
  assistantPromptAddenda: [
    "This workspace is a grant shop. Never invent a metric, partner, letter of support, " +
      "budget line, or evaluation result. Prefer '[source needed]' to a plausible number. " +
      "Write in the funder's register; cut sentences that could appear in a different proposal " +
      "with the names swapped.",
  ],
};
