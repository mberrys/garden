import type { Doc, DocKind } from "@/lib/docs/schema";
import { DOC_KIND_LABELS } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import { describeSelection, serializeDoc } from "./context";
import { opReference } from "./op-reference";
import { OPS_FENCE } from "./ops-block";
import { getSurface } from "@/lib/surfaces/registry";

export function systemPrompt(kind: DocKind, addenda?: string): string {
  const parts = [
    `You are a collaborator inside "garden", a generative document workplace — text, PDF, presentations, and a drawing canvas — more like OpenOffice meets an IDE than four separate apps. Seed packets sprout profession worktrees; you edit through reviewable operations.`,
    `You are currently working on a ${DOC_KIND_LABELS[kind].toLowerCase()}.`,
    "",
    "## How to answer",
    "Reply with a brief sentence or two of plain prose explaining what you are doing.",
    "When the user wants the document changed, follow your prose with exactly one fenced",
    `code block tagged \`${OPS_FENCE}\` containing a JSON array of operations:`,
    "",
    "```" + OPS_FENCE,
    '[{"op": "..."}, {"op": "..."}]',
    "```",
    "",
    "Rules for the block:",
    "- Emit it only when the user asked for a change. Questions get prose alone.",
    "- It must be a JSON array. No comments, no trailing commas, no prose inside it.",
    "- Use only the operations listed below, spelled exactly as shown.",
    "- Reference only ids that appear in the document you were given.",
    "- Every operation is reviewed by the user before it applies, so propose the whole",
    "  change at once rather than asking for permission first.",
    "",
    "## Operations available",
    opReference(kind),
    "",
    "## Notes for this surface",
    getSurface(kind).promptNotes,
  ];
  if (addenda?.trim()) {
    parts.push("", "## Workspace craft", addenda.trim());
  }
  return parts.join("\n");
}

export interface UserTurnOptions {
  doc: Doc;
  request: string;
  selection?: SurfaceSelection;
  /** Other open documents, offered as source material for cross-surface work. */
  companions?: { doc: Doc; selection?: SurfaceSelection }[];
}

export function userTurn({ doc, request, selection, companions }: UserTurnOptions): string {
  const parts: string[] = [];

  const { content, truncated } = serializeDoc(doc, selection);
  parts.push(`## Current ${DOC_KIND_LABELS[doc.kind].toLowerCase()}: "${doc.title}"`);
  parts.push(content);
  if (truncated) parts.push("(the document above was truncated to fit)");

  const selectionNote = describeSelection(selection);
  if (selectionNote) parts.push(`\n## Selection\n${selectionNote}`);

  for (const companion of companions ?? []) {
    const rendered = serializeDoc(companion.doc, companion.selection);
    parts.push(
      `\n## Source material — ${DOC_KIND_LABELS[companion.doc.kind].toLowerCase()} "${companion.doc.title}"`,
    );
    parts.push(rendered.content);
  }

  parts.push(`\n## Request\n${request}`);
  return parts.join("\n");
}

/**
 * Follow-up turn asking the model to fix operations that failed validation.
 *
 * One attempt only. A model that cannot produce valid ops twice in a row will
 * not produce them on the third try either, and the user is waiting.
 */
export function repairTurn(errors: string[], raw: string): string {
  return [
    "Those operations were rejected by the validator:",
    ...errors.map((e) => `- ${e}`),
    "",
    "This is what you sent:",
    "```json",
    raw.trim(),
    "```",
    "",
    `Send the corrected operations, again as a single \`${OPS_FENCE}\` block.`,
    "Fix only what the errors describe and change nothing else. If you cannot fix it,",
    "reply with prose explaining why and send no block at all.",
  ].join("\n");
}
