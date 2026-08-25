import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";

const MATTER = `# Matter notes

**Caption.** (party names as they appear on the docket)
**Jurisdiction.**
**Our role.**

## Issues

Numbered. Each issue is a question the court must answer, not a conclusion.

## Authorities to pull

External citations stay references. Do not paste a holding as if Garden is the reporter of record.

## Drafting constraints

The assistant may outline an argument. It must not invent a citation, a date, or a quotation.
`;

const DRAFT = `# Draft

## Caption

## Introduction

## Argument

Every proposition that is not common knowledge needs a citation row.

## Conclusion
`;

export const legalMatterPacket: SeedPacket = {
  id: "legal/matter",
  version: 1,
  label: "Matter",
  blurb: "Matter notes, a citation corpus with external reporters, issues, and a drafting doc.",
  requires: {
    surfaces: ["text", "database", "pdf"],
    capabilities: ["relations", "external_ref", "garden_ref"],
  },
  starterArtifacts: [
    { localId: "notes", kind: "text", title: "Matter notes", build: () => textFromMarkdown("Matter notes", MATTER) },
    { localId: "draft", kind: "text", title: "Draft", build: () => textFromMarkdown("Draft", DRAFT) },
  ],
  starterBases: [
    {
      localId: "authorities",
      title: "Authorities",
      fields: [
        { id: "fld_cite", name: "Citation", type: "text", origin: "imported" },
        { id: "fld_reporter", name: "Reporter", type: "external_ref", origin: "imported" },
        { id: "fld_holding", name: "Holding (ours)", type: "text", origin: "derived" },
      ],
      views: [{ id: "vw_auth", name: "Grid", type: "grid" }],
      rows: [
        {
          localId: "auth_1",
          cells: {
            fld_cite: "Example v. Example, 1 F.3d 1",
            fld_reporter: { provider: "courtlistener", externalId: "example-v-example", freshness: "unknown" },
            fld_holding: "Draft holding — replace after reading the opinion.",
          },
        },
      ],
      activeViewId: "vw_auth",
    },
    {
      localId: "issues",
      title: "Issues",
      fields: [
        { id: "fld_issue", name: "Issue", type: "text" },
        { id: "fld_auth", name: "Authorities", type: "relation", targetLocalId: "authorities" },
        { id: "fld_status", name: "Status", type: "select", options: ["open", "drafted", "cited"] },
      ],
      views: [
        { id: "vw_issues", name: "Grid", type: "grid" },
        { id: "vw_status", name: "By status", type: "kanban", groupFieldId: "fld_status" },
      ],
      rows: [
        {
          localId: "iss_1",
          cells: { fld_issue: "Whether the limitation period is tolled", fld_status: "open" },
        },
      ],
      activeViewId: "vw_issues",
    },
  ],
  links: [
    {
      kind: "relation",
      rowLocalId: "iss_1",
      fieldId: "fld_auth",
      targetRowLocalIds: ["auth_1"],
    },
  ],
  layout: {
    open: [
      { localId: "notes", pane: 0 },
      { localId: "authorities", pane: 1 },
    ],
    splitView: true,
  },
  recipes: [
    {
      id: "authorities-to-draft",
      label: "Outline from authorities",
      hint: "Draft argument headings grounded in citation rows",
      from: ["database"],
      target: "text",
      newTitle: (title) => `${title} — outline`,
      prompt:
        "Write an argument outline from the authorities base. Do not invent citations. " +
        "Quote only text that appears in a row. Mark every proposition that still needs a source.",
    },
  ],
  featuredRecipeIds: ["authorities-to-draft", "pdf-to-summary"],
  assistantPromptAddenda: [
    "This workspace is a legal-matter kit. External reporters stay references, not clones. " +
      "Do not invent a citation, holding, or quotation. Derived holdings are labelled as ours.",
  ],
  suggestedFlavors: ["developer", "default"],
};
