import { LayoutGrid } from "lucide-react";
import type { MiniDoc } from "@/lib/docs/schema";
import { MiniOpSchema, applyMiniOps } from "@/lib/ops/mini";
import { createMiniDoc } from "@/lib/docs/factories";
import { OPS_FENCE } from "@/lib/ai/ops-block";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import { registerSurface } from "./registry";

function serializeMini(doc: MiniDoc, selection?: SurfaceSelection): string {
  const { descriptor, records } = doc.body;
  const parts = [
    `Mini-tool "${descriptor.label}" template=${descriptor.template} fields=${descriptor.fields.map((f) => f.id).join(",")}.`,
    `${records.length} record(s).`,
  ];
  for (const record of records.slice(0, 40)) {
    parts.push(`  ${record.id} ${JSON.stringify(record.values)}`);
  }
  if (selection?.kind === "mini" && selection.recordId) {
    parts.push(`\nUser selected record ${selection.recordId}`);
  }
  return parts.join("\n");
}

function describeMiniSelection(selection: SurfaceSelection): string | null {
  if (selection.kind !== "mini") return null;
  return selection.recordId ? `The user selected record ${selection.recordId}` : null;
}

function mockMini(request: MockRequest): string {
  const doc = request.doc as MiniDoc;
  const field = doc.body.descriptor.fields[0];
  if (/tool|surface|template/.test(request.request.toLowerCase())) {
    return block("Kept the current mini-tool template.", []);
  }
  return block("Added a scripted record.", [
    {
      op: "addRecord",
      record: { values: field ? { [field.id]: "Scripted item" } : {} },
    },
  ]);
}

function describeMiniOp(op: Record<string, unknown>): string | undefined {
  switch (op.op) {
    case "setDescriptor":
      return "Replace mini-tool descriptor";
    case "addRecord":
      return "Add mini-tool record";
    case "updateRecord":
      return `Update record ${op.id}`;
    case "deleteRecord":
      return `Delete record ${op.id}`;
    case "setField":
      return `Set ${op.fieldId} on ${op.recordId}`;
    default:
      return undefined;
  }
}

registerSurface({
  kind: "mini",
  label: "Mini-tool",
  icon: LayoutGrid,
  iconColor: "#8b5cf6",
  opSchema: MiniOpSchema,
  applyOps: applyMiniOps,
  createDoc: createMiniDoc,
  ownsHistory: false,
  contextBudget: 6_000,
  promptNotes:
    "Mini-tools are constrained templates (card-grid, table, timeline). Emit setDescriptor " +
    "only with a valid field list. Never emit React, HTML, or editor-engine code.",
  serializeDoc: serializeMini,
  describeSelection: describeMiniSelection,
  mockReply: mockMini,
  describeOp: describeMiniOp,
  referencedBlobIds: () => new Set(),
  remapBlobIds: (doc) => doc,
  adapter: {
    engine: "garden",
    status: "not-required",
    userEdits: "template UI commits addRecord/setField ops",
    gardenUpdates: "React template re-renders MiniBody",
    selection: "selected record id",
    notes: "Prompt-to-surface host. Descriptors are data, not generated React.",
    relatedIssue: 10,
  },
  loadComponent: () => import("@/surfaces/mini/mini-surface"),
});

function block(prose: string, ops: unknown[]): string {
  if (ops.length === 0) return prose;
  return `${prose}\n\n\`\`\`${OPS_FENCE}\n${JSON.stringify(ops, null, 2)}\n\`\`\``;
}
