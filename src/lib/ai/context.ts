import type { Doc } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import { getSurface } from "@/lib/surfaces";

/**
 * Serialises a document into the view the model gets.
 *
 * Two constraints shape every format here:
 *  1. A 7B model has a small effective context. Verbose JSON crowds out the
 *     actual content, so each surface gets a compact line-oriented rendering.
 *  2. Ops address things by id or index, so every id and index the model might
 *     need to reference has to appear in the text it reads.
 */

export interface DocContext {
  /** Human-readable rendering handed to the model. */
  content: string;
  /** True when content was cut to fit the budget. */
  truncated: boolean;
}

export function serializeDoc(doc: Doc, selection?: SurfaceSelection): DocContext {
  const surface = getSurface(doc.kind);
  return clamp(surface.serializeDoc(doc, selection), surface.contextBudget);
}

function clamp(content: string, budget: number): DocContext {
  if (content.length <= budget) return { content, truncated: false };
  return {
    content: `${content.slice(0, budget)}\n\n[…truncated, document continues…]`,
    truncated: true,
  };
}

export function describeSelection(selection: SurfaceSelection | undefined): string | null {
  if (!selection) return null;
  return getSurface(selection.kind).describeSelection(selection);
}
