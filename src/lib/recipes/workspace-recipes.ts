import type { Recipe } from "@/lib/ai/recipes";
import { getPacket } from "@/lib/packets/registry";
import { sproutPacket } from "@/lib/packets/sprout";
import { newPlanId } from "@/lib/docs/ids";
import type { WorkspacePlan } from "@/lib/store/transaction";
import type { Doc } from "@/lib/docs/schema";

export interface WorkspaceRecipe {
  id: string;
  label: string;
  hint: string;
  fromPacket?: string;
  plan: (input: { source?: Doc }) => WorkspacePlan;
}

function plantPacketPlan(packetId: string, label: string): WorkspacePlan {
  const packet = getPacket(packetId);
  if (!packet) {
    return { id: newPlanId(), label, changes: [] };
  }
  const sprouted = sproutPacket(packet);
  return {
    id: newPlanId(),
    label,
    changes: [
      ...sprouted.docs.map((doc) => ({ type: "createDoc" as const, doc })),
      { type: "setLayout", panes: sprouted.panes, splitView: sprouted.splitView },
      { type: "setPacketBinding", packetId: packet.id, version: packet.version },
    ],
  };
}

export const WORKSPACE_RECIPES: WorkspaceRecipe[] = [
  {
    id: "comms/campaign-from-brief",
    label: "Campaign from this brief",
    hint: "Plant the campaign packet beside this document",
    fromPacket: "comms/campaign",
    plan: () => plantPacketPlan("comms/campaign", "Plant campaign from brief"),
  },
  {
    id: "data/runs-to-analysis-study",
    label: "Runs to analysis study",
    hint: "Plant the experiment-report packet for findings and decisions",
    fromPacket: "data/experiment-report",
    plan: () => plantPacketPlan("data/experiment-report", "Plant analysis study"),
  },
];

export function workspaceRecipesFor(kind: string): WorkspaceRecipe[] {
  if (kind === "text") return WORKSPACE_RECIPES;
  return [];
}

export function asAssistantRecipes(): Recipe[] {
  return WORKSPACE_RECIPES.map((recipe) => ({
    id: recipe.id,
    label: recipe.label,
    hint: recipe.hint,
    from: ["text"],
    target: "text",
    prompt: `Prepare the workspace recipe "${recipe.label}". Do not emit document ops; the shell will preview a workspace transaction.`,
  }));
}
