import type { SeedPacket } from "./types";
import { textFromMarkdown } from "./build";
import { createSheetDoc } from "@/lib/docs/factories";
import { applyOps } from "@/lib/ops";

const STUDY = `# Study notes

**Question.** What did this experiment actually measure, and for whom?

**Runs.** Import or paste external run ids into External Run Refs. Garden is not
the experiment tracker of record.

**Findings.** A finding is an interpretation. Attach evidence. Do not paste a
metric into a finding cell without a run reference.

The assistant may compare selected runs and draft an analysis narrative. It must
not invent metrics or treat a stale external snapshot as current.`;

const ANALYSIS = `# Analysis narrative

## Takeaway

One paragraph. Every number must appear in an Experiments or Run Ref row.

## Evidence

Link findings to the runs that support or contradict them.

## Decision

What we will do next, and what remains uncertain.`;

function metricsSheet() {
  return applyOps<"sheet">(createSheetDoc("Run metrics"), [
    {
      op: "setCells",
      cells: {
        A1: "run",
        B1: "metric",
        C1: "value",
        A2: "run-001",
        B2: "latency_p99",
        C2: "210",
      },
    },
  ]).doc;
}

export const experimentReportPacket: SeedPacket = {
  id: "data/experiment-report",
  version: 1,
  label: "Experiment report",
  blurb:
    "Study notes, experiment rows, external run refs, findings, decisions, a metrics sheet, and an analysis doc.",
  requires: {
    surfaces: ["text", "database", "sheet"],
    capabilities: ["relations", "external_ref"],
  },
  starterArtifacts: [
    { localId: "study", kind: "text", title: "Study notes", build: () => textFromMarkdown("Study notes", STUDY) },
    { localId: "metrics", kind: "sheet", title: "Run metrics", build: metricsSheet },
    {
      localId: "analysis",
      kind: "text",
      title: "Analysis narrative",
      build: () => textFromMarkdown("Analysis narrative", ANALYSIS),
    },
  ],
  starterBases: [
    {
      localId: "experiments",
      title: "Experiments",
      fields: [
        { id: "fld_name", name: "Name", type: "text" },
        { id: "fld_status", name: "Status", type: "select", options: ["planned", "running", "done"] },
        { id: "fld_question", name: "Question", type: "text" },
      ],
      views: [
        { id: "vw_grid", name: "Grid", type: "grid" },
        { id: "vw_status", name: "By status", type: "kanban", groupFieldId: "fld_status" },
      ],
      rows: [
        {
          localId: "exp_1",
          cells: { fld_name: "Latency regression", fld_status: "done", fld_question: "Did p99 fall?" },
        },
      ],
      activeViewId: "vw_grid",
    },
    {
      localId: "runs",
      title: "External Run Refs",
      fields: [
        { id: "fld_provider", name: "Provider", type: "text", origin: "imported" },
        { id: "fld_ext", name: "Run", type: "external_ref", origin: "imported" },
        { id: "fld_exp", name: "Experiment", type: "relation", targetLocalId: "experiments" },
      ],
      views: [{ id: "vw_runs", name: "Grid", type: "grid" }],
      rows: [
        {
          localId: "run_1",
          cells: {
            fld_provider: "mlflow",
            fld_ext: {
              provider: "mlflow",
              externalId: "run-001",
              freshness: "unknown",
            },
          },
        },
      ],
      activeViewId: "vw_runs",
    },
    {
      localId: "findings",
      title: "Findings",
      fields: [
        { id: "fld_claim", name: "Finding", type: "text", origin: "derived" },
        { id: "fld_exp_f", name: "Experiment", type: "relation", targetLocalId: "experiments" },
        { id: "fld_status_f", name: "Review", type: "select", options: ["draft", "supported", "disputed"] },
      ],
      views: [
        { id: "vw_find", name: "Review queue", type: "kanban", groupFieldId: "fld_status_f" },
      ],
      rows: [
        {
          localId: "find_1",
          cells: {
            fld_claim: "p99 latency fell after the pool change",
            fld_status_f: "draft",
          },
        },
      ],
      activeViewId: "vw_find",
    },
    {
      localId: "decisions",
      title: "Decisions",
      fields: [
        { id: "fld_decision", name: "Decision", type: "text", origin: "derived" },
        { id: "fld_finding", name: "Finding", type: "relation", targetLocalId: "findings" },
      ],
      views: [{ id: "vw_dec", name: "Grid", type: "grid" }],
      rows: [],
      activeViewId: "vw_dec",
    },
  ],
  links: [
    {
      kind: "relation",
      rowLocalId: "run_1",
      fieldId: "fld_exp",
      targetRowLocalIds: ["exp_1"],
    },
    {
      kind: "relation",
      rowLocalId: "find_1",
      fieldId: "fld_exp_f",
      targetRowLocalIds: ["exp_1"],
    },
  ],
  layout: {
    open: [
      { localId: "experiments", pane: 0 },
      { localId: "analysis", pane: 1 },
    ],
    splitView: true,
  },
  recipes: [
    {
      id: "runs-to-findings",
      label: "Draft findings from runs",
      hint: "Propose finding rows from selected run refs",
      from: ["database"],
      target: "database",
      prompt:
        "Add draft finding rows grounded in the visible run refs. Do not invent metrics. " +
        "Mark review as draft. Keep observed numbers in run refs, not in findings.",
    },
    {
      id: "findings-to-narrative",
      label: "Write the analysis",
      hint: "Turn findings into the analysis narrative",
      from: ["database"],
      target: "text",
      newTitle: (title) => `${title} — analysis`,
      prompt:
        "Write an analysis narrative from the findings base. Every number must appear in a " +
        "run or experiment row. Separate evidence from recommendation.",
    },
  ],
  featuredRecipeIds: ["runs-to-findings", "findings-to-narrative", "sheet-to-doc"],
  assistantPromptAddenda: [
    "This workspace is an experiment-report kit. External runs stay references, not clones. " +
      "Do not invent metrics. Findings are derived; run values are observed/imported.",
  ],
  suggestedFlavors: ["data", "developer"],
};
