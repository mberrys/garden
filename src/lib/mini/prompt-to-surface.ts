import { createMiniDoc } from "@/lib/docs/factories";
import type { MiniDescriptor, MiniDoc } from "@/lib/docs/schema";
import { newFieldId, newPlanId } from "@/lib/docs/ids";
import type { WorkspaceChange, WorkspacePlan } from "@/lib/store/transaction";
import type { Pane } from "@/lib/store/workspace";

const TEMPLATES = ["card-grid", "table", "timeline"] as const;

export function isPromptToSurfaceRequest(request: string): boolean {
  return /mini-?tool|new surface|prompt.to.surface|make a tool|custom tool/i.test(request);
}

export function descriptorFromPrompt(request: string, title = "Custom tool"): MiniDescriptor {
  const lower = request.toLowerCase();
  const template = TEMPLATES.find((item) => lower.includes(item)) ?? "table";
  const fields = [
    { id: newFieldId(), name: "Name", type: "text" as const },
    { id: newFieldId(), name: "Notes", type: "text" as const },
  ];
  return {
    id: `mini_${template}`,
    label: title,
    template,
    fields,
  };
}

export function miniDocFromPrompt(request: string, title?: string): MiniDoc {
  const doc = createMiniDoc(title ?? "Proposed mini-tool");
  return {
    ...doc,
    body: { ...doc.body, descriptor: descriptorFromPrompt(request, doc.title) },
  };
}

export function promptToSurfacePlan(options: {
  request: string;
  sourceId?: string;
  panes: [Pane, Pane];
  splitView: boolean;
}): { plan: WorkspacePlan; doc: MiniDoc } {
  const doc = miniDocFromPrompt(options.request);
  const pane0 = options.panes[0];
  const changes: WorkspaceChange[] = [
    { type: "createDoc", doc },
    {
      type: "setLayout",
      panes: [
        pane0,
        {
          docIds: [...options.panes[1].docIds, doc.id],
          activeDocId: doc.id,
        },
      ],
      splitView: true,
    },
  ];
  return {
    doc,
    plan: {
      id: newPlanId(),
      label: `Propose mini-tool: ${doc.title}`,
      changes,
    },
  };
}
