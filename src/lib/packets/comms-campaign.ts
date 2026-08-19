import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createDeckDoc, makeSlide } from "@/lib/docs/factories";

const BRIEF = `# Campaign brief — Q3 narrative launch

**Objective.** Position the product as the credible alternative for teams that need
structured work without a cloud suite.

**Audience.** Operations leads at mid-market companies evaluating workplace tools.

**Timing.** Announce in September; press window opens 12 September.

**Success.** Three tier-one placements, sustained positive tone in product reviews,
and at least two customer proof points in coverage.

**Constraints.** No unreleased metrics. Customer names only with written approval.

Replace this brief with your own campaign. The assistant should treat observed
coverage facts separately from interpretive tone or evaluation.`;

const MESSAGE_HOUSE = `# Message house

## Core promise
A light modular workplace — documents, databases, decks, and reviewable AI in one
local-first worktree.

## Proof points
- Typed operations with preview before apply
- Seed packets that sprout profession-ready topology
- Cross-surface recipes without vendor lock-in

## Audience hooks
- **Ops lead:** replace three SaaS tools without losing structure
- **Research lead:** provenance from source to claim without a monolith
- **Comms lead:** pitch pipeline + coverage ledger in one workspace

## Do not say
- "Replaces your entire stack overnight"
- Invented customer counts or benchmark numbers`;

function resultsDeck() {
  const doc = createDeckDoc("Campaign results");
  return {
    ...doc,
    body: {
      ...doc.body,
      slides: [
        makeSlide("title", {
          title: "Campaign results",
          subtitle: "Coverage and narrative — Q3 launch",
          notes: "Open with whether the campaign met the placement goal.",
        }),
        makeSlide("bullets", {
          title: "Placements",
          bullets: [
            "Tier-one: add confirmed outlets here",
            "Product reviews: note tone vs benchmark",
            "Customer proof: only approved names",
          ],
          notes: "Separate observed headlines from interpretive evaluation.",
        }),
        makeSlide("title-body", {
          title: "What we learned",
          body: "Which angles landed, which contacts converted, and what to carry into the next cycle.",
          notes: "Recommendations are analysis — tie them to coverage rows.",
        }),
      ],
    },
  };
}

export const commsCampaignPacket: SeedPacket = {
  id: "comms/campaign",
  version: 1,
  label: "Campaign",
  blurb:
    "Campaign brief, message house, contacts, story pipeline, pitch log, coverage ledger, and results deck.",
  requires: {
    surfaces: ["text", "database", "deck"],
    capabilities: ["relations"],
  },
  suggestedFlavors: ["art", "data"],
  starterArtifacts: [
    {
      localId: "brief",
      kind: "text",
      title: "Campaign Brief",
      build: () => textFromMarkdown("Campaign Brief", BRIEF),
    },
    {
      localId: "messages",
      kind: "text",
      title: "Message House",
      build: () => textFromMarkdown("Message House", MESSAGE_HOUSE),
    },
    {
      localId: "results",
      kind: "deck",
      title: "Results",
      build: resultsDeck,
    },
  ],
  starterBases: [
    {
      localId: "contacts",
      title: "Contacts",
      fields: [
        { id: "fld_name", name: "Name", type: "text" },
        { id: "fld_outlet", name: "Outlet", type: "text" },
        { id: "fld_email", name: "Email", type: "text" },
        {
          id: "fld_role",
          name: "Role",
          type: "select",
          options: ["Editor", "Reporter", "Producer", "Analyst"],
        },
      ],
      views: [
        {
          id: "vw_contacts_grid",
          name: "Grid",
          type: "grid",
        },
      ],
      rows: [
        {
          localId: "contact_1",
          cells: {
            fld_name: "Nina Okonkwo",
            fld_outlet: "The Ledger",
            fld_email: "nina@theledger.example",
            fld_role: "Editor",
          },
        },
        {
          localId: "contact_2",
          cells: {
            fld_name: "James Holt",
            fld_outlet: "Workplace Weekly",
            fld_email: "james@ww.example",
            fld_role: "Reporter",
          },
        },
      ],
    },
    {
      localId: "angles",
      title: "Story Angles",
      fields: [
        { id: "fld_title", name: "Title", type: "text" },
        {
          id: "fld_status",
          name: "Status",
          type: "select",
          options: ["Idea", "Ready", "Pitched", "Placed", "Closed"],
        },
        { id: "fld_angle", name: "Angle", type: "text" },
        {
          id: "fld_contact",
          name: "Lead contact",
          type: "relation",
          targetLocalId: "contacts",
        },
      ],
      views: [
        {
          id: "vw_angles_kanban",
          name: "Pipeline",
          type: "kanban",
          groupFieldId: "fld_status",
        },
        {
          id: "vw_angles_grid",
          name: "Grid",
          type: "grid",
        },
      ],
      activeViewId: "vw_angles_kanban",
      rows: [
        {
          localId: "angle_1",
          cells: {
            fld_title: "Local-first workplace",
            fld_status: "Ready",
            fld_angle: "Teams replacing Airtable + Notion without losing structure",
          },
        },
        {
          localId: "angle_2",
          cells: {
            fld_title: "Reviewable AI ops",
            fld_status: "Pitched",
            fld_angle: "Why preview-before-apply matters for regulated comms",
          },
        },
        {
          localId: "angle_3",
          cells: {
            fld_title: "Seed packets",
            fld_status: "Idea",
            fld_angle: "Profession kits vs blank SaaS grids",
          },
        },
      ],
    },
    {
      localId: "pitches",
      title: "Pitch Interactions",
      fields: [
        { id: "fld_date", name: "Date", type: "date" },
        {
          id: "fld_pitch_status",
          name: "Status",
          type: "select",
          options: ["Draft", "Sent", "Follow-up", "Done"],
        },
        {
          id: "fld_story",
          name: "Story angle",
          type: "relation",
          targetLocalId: "angles",
        },
        {
          id: "fld_pitch_contact",
          name: "Contact",
          type: "relation",
          targetLocalId: "contacts",
        },
        { id: "fld_notes", name: "Notes", type: "text" },
      ],
      views: [
        { id: "vw_pitches_grid", name: "Grid", type: "grid" },
      ],
      rows: [
        {
          localId: "pitch_1",
          cells: {
            fld_date: "2026-09-02",
            fld_pitch_status: "Sent",
            fld_notes: "Pitched local-first angle to Nina — asked for customer proof",
          },
        },
      ],
    },
    {
      localId: "coverage",
      title: "Coverage",
      fields: [
        { id: "fld_headline", name: "Headline", type: "text" },
        { id: "fld_cov_outlet", name: "Outlet", type: "text" },
        { id: "fld_cov_date", name: "Date", type: "date" },
        {
          id: "fld_tone",
          name: "Tone (interpretation)",
          type: "select",
          options: ["Positive", "Neutral", "Critical", "Mixed"],
        },
        {
          id: "fld_pitch_link",
          name: "Pitch",
          type: "relation",
          targetLocalId: "pitches",
        },
        { id: "fld_url", name: "URL", type: "url" },
      ],
      views: [
        { id: "vw_coverage_grid", name: "Grid", type: "grid" },
      ],
      rows: [
        {
          localId: "cov_1",
          cells: {
            fld_headline: "A thinner tool for structured team work",
            fld_cov_outlet: "Workplace Weekly",
            fld_cov_date: "2026-09-14",
            fld_tone: "Positive",
            fld_url: "https://example.com/review",
          },
        },
      ],
    },
  ],
  links: [
    {
      kind: "relation",
      rowLocalId: "angle_1",
      fieldId: "fld_contact",
      targetRowLocalIds: ["contact_1"],
    },
    {
      kind: "relation",
      rowLocalId: "pitch_1",
      fieldId: "fld_story",
      targetRowLocalIds: ["angle_2"],
    },
    {
      kind: "relation",
      rowLocalId: "pitch_1",
      fieldId: "fld_pitch_contact",
      targetRowLocalIds: ["contact_1"],
    },
    {
      kind: "relation",
      rowLocalId: "cov_1",
      fieldId: "fld_pitch_link",
      targetRowLocalIds: ["pitch_1"],
    },
  ],
  layout: {
    open: [
      { localId: "brief", pane: 0 },
      { localId: "angles", pane: 1 },
    ],
    splitView: true,
  },
  recipes: [
    {
      id: "coverage-to-summary",
      label: "Summarise coverage",
      hint: "Draft a short coverage summary in a new document",
      from: ["database"],
      target: "text",
      newTitle: (title) => `${title} — summary`,
      prompt:
        "Read the coverage rows in this database. Create a structured summary in a new " +
        "document: observed placements (headline, outlet, date, URL) then a short " +
        "interpretive section on tone and gaps. Do not invent placements.",
    },
  ],
  featuredRecipeIds: ["coverage-to-summary", "doc-to-deck"],
  assistantPromptAddenda: [
    "This workspace is a communications campaign kit. Keep observed coverage facts " +
      "(headline, outlet, date, URL) separate from interpretive fields like tone or " +
      "evaluation. Never invent a placement, quote, or metric.",
  ],
};
